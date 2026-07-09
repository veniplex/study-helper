import "server-only"
import nodemailer from "nodemailer"
import { getSetting } from "./settings"

export async function isEmailConfigured(): Promise<boolean> {
  return (await getSetting("smtp")) != null
}

export async function sendEmail(options: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<void> {
  const smtp = await getSetting("smtp")
  if (!smtp) {
    console.warn(`[email] SMTP not configured — cannot send "${options.subject}" to ${options.to}`)
    return
  }
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  })
  await transporter.sendMail({
    from: smtp.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  })
}
