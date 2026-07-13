use bore_cli::client::Client;

pub struct TunnelHandle {
    pub url: String,
    pub pin: String,
    task: tokio::task::JoinHandle<()>,
}

impl TunnelHandle {
    pub fn stop(&self) {
        self.task.abort();
    }
}

/// Connect to bore.pub and start a public tunnel for the given local port.
/// Returns the public URL (http://bore.pub:PORT) and a 4-digit party PIN.
pub async fn start_tunnel(local_port: u16) -> Result<TunnelHandle, String> {
    let client = Client::new("localhost", local_port, "bore.pub", 0, None)
        .await
        .map_err(|e| format!("Failed to connect to bore.pub: {}", e))?;

    let remote_port = client.remote_port();
    let url = format!("http://bore.pub:{}", remote_port);

    // Generate 4-digit party PIN from sub-second system time
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let pin = format!("{:04}", nanos % 10000);

    let task = tokio::spawn(async move {
        if let Err(e) = client.listen().await {
            eprintln!("[tunnel] bore ended: {}", e);
        }
    });

    Ok(TunnelHandle { url, pin, task })
}
