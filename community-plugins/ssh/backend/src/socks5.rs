//! SOCKS5 no-auth CONNECT (RFC 1928) used by `ssh/forward` `kind=dynamic`.
//! Handshake and CONNECT parsing are pure so tests do not need a socket.

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const VER: u8 = 5;
const CMD_CONNECT: u8 = 1;
const ATYP_IPV4: u8 = 1;
const ATYP_DOMAIN: u8 = 3;
const ATYP_IPV6: u8 = 4;
const METHOD_NO_AUTH: u8 = 0;
const REP_SUCCEEDED: u8 = 0;
const REP_COMMAND_NOT_SUPPORTED: u8 = 7;
const REP_ADDRESS_NOT_SUPPORTED: u8 = 8;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SocksConnect {
    pub host: String,
    pub port: u16,
}

/// Greeting: VER, NMETHODS, METHODS… → number of method bytes that follow the header.
pub fn parse_greeting(bytes: &[u8]) -> Result<usize, String> {
    if bytes.len() < 2 {
        return Err("SOCKS greeting is truncated".to_string());
    }
    if bytes[0] != VER {
        return Err(format!("SOCKS version must be 5, got {}", bytes[0]));
    }
    Ok(bytes[1] as usize)
}

/// CONNECT request after the method negotiation. Returns dest + bytes consumed.
pub fn parse_connect_request(bytes: &[u8]) -> Result<(SocksConnect, usize), String> {
    if bytes.len() < 7 {
        return Err("SOCKS CONNECT is truncated".to_string());
    }
    if bytes[0] != VER {
        return Err(format!("SOCKS version must be 5, got {}", bytes[0]));
    }
    if bytes[1] != CMD_CONNECT {
        return Err("SOCKS command must be CONNECT".to_string());
    }
    let atyp = bytes[3];
    let (host, addr_end) = match atyp {
        ATYP_IPV4 => {
            if bytes.len() < 10 {
                return Err("SOCKS IPv4 CONNECT is truncated".to_string());
            }
            let ip = format!("{}.{}.{}.{}", bytes[4], bytes[5], bytes[6], bytes[7]);
            (ip, 8)
        }
        ATYP_DOMAIN => {
            let len = bytes[4] as usize;
            if len == 0 || bytes.len() < 5 + len + 2 {
                return Err("SOCKS domain CONNECT is truncated".to_string());
            }
            let host = std::str::from_utf8(&bytes[5..5 + len])
                .map_err(|_| "SOCKS domain is not UTF-8".to_string())?
                .to_string();
            if host.is_empty() || host.contains('\0') || host.len() > 253 {
                return Err("SOCKS domain is invalid".to_string());
            }
            (host, 5 + len)
        }
        ATYP_IPV6 => {
            if bytes.len() < 22 {
                return Err("SOCKS IPv6 CONNECT is truncated".to_string());
            }
            let mut octets = [0_u8; 16];
            octets.copy_from_slice(&bytes[4..20]);
            (std::net::Ipv6Addr::from(octets).to_string(), 20)
        }
        other => return Err(format!("SOCKS address type {other} is not supported")),
    };
    let port = u16::from_be_bytes([bytes[addr_end], bytes[addr_end + 1]]);
    if port == 0 {
        return Err("SOCKS destination port must not be 0".to_string());
    }
    Ok((SocksConnect { host, port }, addr_end + 2))
}

fn reply(rep: u8) -> [u8; 10] {
    [VER, rep, 0, ATYP_IPV4, 0, 0, 0, 0, 0, 0]
}

/// Negotiate no-auth SOCKS5 and read one CONNECT. Writes the success (or
/// failure) reply before returning.
pub async fn accept_connect(stream: &mut TcpStream) -> Result<SocksConnect, String> {
    let mut header = [0_u8; 2];
    stream
        .read_exact(&mut header)
        .await
        .map_err(|error| format!("SOCKS greeting failed: {error}"))?;
    let nmethods = parse_greeting(&header)?;
    let mut methods = vec![0_u8; nmethods];
    if nmethods > 0 {
        stream
            .read_exact(&mut methods)
            .await
            .map_err(|error| format!("SOCKS methods failed: {error}"))?;
    }
    if !methods.contains(&METHOD_NO_AUTH) && nmethods > 0 {
        let _ = stream.write_all(&[VER, 0xff]).await;
        return Err("SOCKS client does not offer no-auth".to_string());
    }
    stream
        .write_all(&[VER, METHOD_NO_AUTH])
        .await
        .map_err(|error| format!("SOCKS method reply failed: {error}"))?;

    let mut prefix = [0_u8; 4];
    stream
        .read_exact(&mut prefix)
        .await
        .map_err(|error| format!("SOCKS request failed: {error}"))?;
    if prefix[0] != VER {
        return Err("SOCKS version must be 5".to_string());
    }
    if prefix[1] != CMD_CONNECT {
        let _ = stream.write_all(&reply(REP_COMMAND_NOT_SUPPORTED)).await;
        return Err("SOCKS command must be CONNECT".to_string());
    }
    let mut rest = Vec::new();
    match prefix[3] {
        ATYP_IPV4 => {
            rest.resize(6, 0);
            stream
                .read_exact(&mut rest)
                .await
                .map_err(|error| format!("SOCKS IPv4 dest failed: {error}"))?;
        }
        ATYP_DOMAIN => {
            let mut len = [0_u8; 1];
            stream
                .read_exact(&mut len)
                .await
                .map_err(|error| format!("SOCKS domain length failed: {error}"))?;
            rest.push(len[0]);
            rest.resize(1 + len[0] as usize + 2, 0);
            stream
                .read_exact(&mut rest[1..])
                .await
                .map_err(|error| format!("SOCKS domain dest failed: {error}"))?;
        }
        ATYP_IPV6 => {
            rest.resize(18, 0);
            stream
                .read_exact(&mut rest)
                .await
                .map_err(|error| format!("SOCKS IPv6 dest failed: {error}"))?;
        }
        other => {
            let _ = stream.write_all(&reply(REP_ADDRESS_NOT_SUPPORTED)).await;
            return Err(format!("SOCKS address type {other} is not supported"));
        }
    }
    let mut request = prefix.to_vec();
    request.extend_from_slice(&rest);
    let (dest, _) = parse_connect_request(&request)?;
    stream
        .write_all(&reply(REP_SUCCEEDED))
        .await
        .map_err(|error| format!("SOCKS success reply failed: {error}"))?;
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeting_counts_methods() {
        assert_eq!(parse_greeting(&[5, 1, 0]).unwrap(), 1);
        assert!(parse_greeting(&[4, 1]).unwrap_err().contains("version"));
    }

    #[test]
    fn parses_ipv4_connect() {
        let bytes = [5, 1, 0, 1, 127, 0, 0, 1, 0x04, 0xd2];
        let (dest, used) = parse_connect_request(&bytes).unwrap();
        assert_eq!(dest, SocksConnect { host: "127.0.0.1".into(), port: 1234 });
        assert_eq!(used, 10);
    }

    #[test]
    fn parses_domain_connect() {
        let mut bytes = vec![5, 1, 0, 3, 11];
        bytes.extend(b"example.com");
        bytes.extend([0x01, 0xbb]);
        let (dest, _) = parse_connect_request(&bytes).unwrap();
        assert_eq!(dest.host, "example.com");
        assert_eq!(dest.port, 443);
    }

    #[test]
    fn parses_ipv6_connect() {
        let mut bytes = vec![5, 1, 0, 4];
        bytes.extend([0_u8; 15]);
        bytes.push(1);
        bytes.extend([0, 80]);
        let (dest, _) = parse_connect_request(&bytes).unwrap();
        assert_eq!(dest.host, "::1");
        assert_eq!(dest.port, 80);
    }

    #[test]
    fn rejects_bind_and_port_zero() {
        assert!(parse_connect_request(&[5, 2, 0, 1, 1, 2, 3, 4, 0, 80])
            .unwrap_err()
            .contains("CONNECT"));
        assert!(parse_connect_request(&[5, 1, 0, 1, 1, 2, 3, 4, 0, 0])
            .unwrap_err()
            .contains("port"));
    }
}
