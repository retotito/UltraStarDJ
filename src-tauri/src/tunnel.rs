use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::io::copy_bidirectional;
use tokio::net::TcpStream;

#[derive(Deserialize)]
struct TunnelAssignment {
    url: String,
    port: u16,
    max_conn_count: Option<u32>,
}

pub struct TunnelHandle {
    pub url: String,
    pub pin: String,
    running: Arc<AtomicBool>,
}

impl TunnelHandle {
    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

/// Request a tunnel from localtunnel.me and start a pool of TCP proxy connections.
/// Returns the public URL and a 4-digit party PIN.
pub async fn start_tunnel(local_port: u16) -> Result<TunnelHandle, String> {
    let client = reqwest::Client::builder()
        .user_agent("UltrastarDJ/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let assignment: TunnelAssignment = client
        .get("https://localtunnel.me/")
        .query(&[("new", "1")])
        .send()
        .await
        .map_err(|e| format!("Failed to reach localtunnel.me: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Invalid tunnel response: {}", e))?;

    let url = assignment.url.clone();
    let tunnel_port = assignment.port;
    let conn_count = assignment.max_conn_count.unwrap_or(10).min(10) as usize;

    // Generate a 4-digit party PIN from sub-second system time
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let pin = format!("{:04}", nanos % 10000);

    let running = Arc::new(AtomicBool::new(true));

    // Spawn a pool of persistent TCP proxy connections.
    // Each connection handles one HTTP request at a time, then reconnects.
    for _ in 0..conn_count {
        let running_c = running.clone();
        let local = local_port;

        tokio::spawn(async move {
            while running_c.load(Ordering::Relaxed) {
                match (
                    TcpStream::connect(("localtunnel.me", tunnel_port)).await,
                    TcpStream::connect(("127.0.0.1", local)).await,
                ) {
                    (Ok(mut remote), Ok(mut local_conn)) => {
                        let _ = copy_bidirectional(&mut remote, &mut local_conn).await;
                    }
                    _ => {
                        if running_c.load(Ordering::Relaxed) {
                            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                        }
                    }
                }
            }
        });
    }

    Ok(TunnelHandle { url, pin, running })
}
