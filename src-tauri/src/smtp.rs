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

fn send_blocking(args: SendEmailArgs) -> Result<(), String> {
    let from_mbox: Mailbox = args
        .from
        .parse()
        .map_err(|e| format!("invalid from address: {e}"))?;
    let to_mbox: Mailbox = args
        .to
        .parse()
        .map_err(|e| format!("invalid to address: {e}"))?;

    let builder = Message::builder()
        .from(from_mbox)
        .to(to_mbox)
        .subject(&args.subject);

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

    let to_domain = args.to.split('@').nth(1).unwrap_or("unknown");
    log::info!(
        "smtp: sent subject_len={} to_domain={}",
        args.subject.len(),
        to_domain
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
