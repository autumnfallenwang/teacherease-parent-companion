// SMTP send (Q4 / E1). Tauri command invoked by the TS `EmailChannel`.
// Webviews can't speak raw TCP, so SMTP lives in Rust via `lettre`. Blocking
// transport inside `spawn_blocking` keeps the async runtime free.

use lettre::message::{Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{Message, SmtpTransport, Transport};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailArgs {
    host: String,
    port: u16,
    username: String,
    password: String,
    from: String,
    to: String,
    subject: String,
    body: String,
    html_body: Option<String>,
}

#[tauri::command]
pub async fn send_email(args: SendEmailArgs) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || send_blocking(args))
        .await
        .map_err(|e| format!("smtp join error: {e}"))?
}

/// Splits the comma-separated `smtp.to` setting into individual `Mailbox`
/// values. Trims whitespace and skips empty segments. Errors on the first
/// malformed address with a message naming the bad entry.
fn parse_recipients(raw: &str) -> Result<Vec<Mailbox>, String> {
    let out: Vec<Mailbox> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| {
            s.parse::<Mailbox>()
                .map_err(|e| format!("invalid recipient '{s}': {e}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if out.is_empty() {
        return Err("no recipients configured".to_string());
    }
    Ok(out)
}

fn send_blocking(args: SendEmailArgs) -> Result<(), String> {
    let from_mbox: Mailbox = args
        .from
        .parse()
        .map_err(|e| format!("invalid from address: {e}"))?;
    let recipients = parse_recipients(&args.to)?;

    let mut builder = Message::builder().from(from_mbox).subject(&args.subject);
    for mbox in recipients.iter() {
        builder = builder.to(mbox.clone());
    }

    let email = match &args.html_body {
        Some(html) => builder
            .multipart(
                MultiPart::alternative()
                    .singlepart(SinglePart::plain(args.body.clone()))
                    .singlepart(SinglePart::html(html.clone())),
            )
            .map_err(|e| format!("build multipart message: {e}"))?,
        None => builder
            .body(args.body.clone())
            .map_err(|e| format!("build message: {e}"))?,
    };

    let creds = Credentials::new(args.username, args.password);

    // Gmail uses STARTTLS on 587, implicit TLS on 465. Default to STARTTLS
    // unless the port indicates implicit TLS.
    let builder = if args.port == 465 {
        SmtpTransport::relay(&args.host).map_err(|e| format!("relay init: {e}"))?
    } else {
        SmtpTransport::starttls_relay(&args.host).map_err(|e| format!("starttls init: {e}"))?
    };

    let mailer = builder.port(args.port).credentials(creds).build();

    mailer
        .send(&email)
        .map_err(|e| format!("send failed: {e}"))?;

    let to_domains: Vec<String> = recipients
        .iter()
        .map(|m| m.email.domain().to_string())
        .collect();
    log::info!(
        "smtp: sent subject_len={} recipients={} to_domains={}",
        args.subject.len(),
        recipients.len(),
        to_domains.join(",")
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_recipients_single() {
        let out = parse_recipients("alice@example.com").unwrap();
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].email.to_string(), "alice@example.com");
    }

    #[test]
    fn parse_recipients_multiple_with_whitespace() {
        let out =
            parse_recipients("alice@example.com, bob@example.com ,  charlie@example.com").unwrap();
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].email.to_string(), "alice@example.com");
        assert_eq!(out[1].email.to_string(), "bob@example.com");
        assert_eq!(out[2].email.to_string(), "charlie@example.com");
    }

    #[test]
    fn parse_recipients_skips_empty_segments() {
        let out = parse_recipients("alice@example.com, , bob@example.com,").unwrap();
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn parse_recipients_rejects_malformed() {
        let err = parse_recipients("alice@example.com, not-an-email").unwrap_err();
        assert!(err.contains("invalid recipient"));
        assert!(err.contains("not-an-email"));
    }

    #[test]
    fn parse_recipients_empty_input_errors() {
        let err = parse_recipients("").unwrap_err();
        assert!(err.contains("no recipients"));
        let err = parse_recipients(" , , ").unwrap_err();
        assert!(err.contains("no recipients"));
    }

    // E5 — live-send smoke test. Silent-skip unless EMAIL_LIVE=1 (matches
    // TEACHEREASE_LIVE convention). Reads SMTP_* from sandbox/.env (dev-dep
    // dotenvy) or shell env. Exercises the production `send_blocking` path.
    //
    // Run: (cd src-tauri && EMAIL_LIVE=1 cargo test live_smtp -- --nocapture)
    #[test]
    fn live_smtp_send() {
        let _ = dotenvy::from_path("../sandbox/.env");

        if std::env::var("EMAIL_LIVE").ok().as_deref() != Some("1") {
            return;
        }

        let args = SendEmailArgs {
            host: std::env::var("SMTP_HOST").expect("SMTP_HOST"),
            port: std::env::var("SMTP_PORT")
                .expect("SMTP_PORT")
                .parse()
                .expect("SMTP_PORT must be an integer"),
            username: std::env::var("SMTP_USERNAME").expect("SMTP_USERNAME"),
            password: std::env::var("SMTP_PASSWORD").expect("SMTP_PASSWORD"),
            from: std::env::var("SMTP_FROM").expect("SMTP_FROM"),
            to: std::env::var("SMTP_TO").expect("SMTP_TO"),
            subject: "TeacherEase Parent Companion: E5 live smoke test".to_string(),
            body: "E5 live-send smoke test: plaintext part.\n\nIf you see this, the Rust SMTP transport is working."
                .to_string(),
            html_body: Some(
                "<p>E5 live-send smoke test: HTML part.</p>\
                 <p>If you see this, the Rust SMTP transport is working with multipart.</p>"
                    .to_string(),
            ),
        };

        send_blocking(args).expect("live smtp send_blocking failed");
    }
}
