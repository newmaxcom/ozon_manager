import crypto from "crypto";

const secretKey = process.env.SECRET_KEY;

export function decryptData(encrypted) {
  const iv = Buffer.alloc(16, 0);
  let decipher = crypto.createDecipheriv("aes-256-cbc", secretKey, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

export function encryptData(string) {
  const iv = new Uint8Array(16);
  let cipher = crypto.createCipheriv("aes-256-cbc", secretKey, iv);
  let encrypted = cipher.update(string, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}
