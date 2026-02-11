export interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface EmailPayload {
  From: string;
  To: string;
  Important: boolean;
  Subject: string;
  BodyText: string;
  Attachments: string[];
}
