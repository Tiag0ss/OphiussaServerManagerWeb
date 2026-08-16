/** Default ports: privileged 21 only in production containers; high ports for local `npm run dev`. */
export function ftpPort() {
  if (process.env.FTP_PORT) return Number(process.env.FTP_PORT);
  return process.env.NODE_ENV === "production" ? 21 : 2121;
}

export function sftpPort() {
  if (process.env.SFTP_PORT) return Number(process.env.SFTP_PORT);
  return 2022;
}

export function httpPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  return 3000;
}
