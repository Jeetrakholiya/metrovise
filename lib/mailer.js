const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const user = process.env.GMAIL_USER;
const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
const appPassword = process.env.GMAIL_APP_PASSWORD;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

/**
 * Creates Supabase Client if credentials exist
 */
function getSupabaseClient() {
  const url = supabaseUrl;
  const key = supabaseServiceRole || supabaseAnonKey;
  if (url && key && url.startsWith('http')) {
    try {
      return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    } catch (e) {
      console.warn('⚠️ Supabase Mailer Init Warning:', e.message);
    }
  }
  return null;
}

/**
 * Creates Nodemailer Transporter based on provided environment variables
 */
function createTransporter() {
  if (!user) {
    return null; // Dev mode fallback
  }

  // 1. Prioritize OAuth 2.0 if credentials are provided
  if (clientId && clientSecret && refreshToken) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: user,
        clientId: clientId,
        clientSecret: clientSecret,
        refreshToken: refreshToken,
      },
    });
  }

  // 2. Fallback to Gmail SMTP App Password
  if (appPassword) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user,
        pass: appPassword.replace(/\s+/g, ''),
      },
    });
  }

  return null;
}

/**
 * Sends a responsive, professional HTML verification email with the 6-digit OTP
 */
async function sendOtpEmail(toEmail, otp) {
  const supabase = getSupabaseClient();
  const transporter = createTransporter();

  // 1. Try Supabase Auth OTP first if Supabase is connected
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithOtp({
        email: toEmail,
        options: {
          data: { otp_code: otp, app: 'Metrovise' }
        }
      });
      if (!error) {
        console.log(`✉️ [SUPABASE AUTH] OTP Email dispatched to ${toEmail}`);
        return { provider: 'supabase', sent: true, devMode: false };
      } else {
        console.warn('Supabase signInWithOtp note:', error.message);
      }
    } catch (sbErr) {
      console.warn('Supabase OTP dispatch error:', sbErr.message);
    }
  }

  // 2. Try Nodemailer / Gmail SMTP Transport
  if (transporter) {
    try {
      const mailOptions = {
        from: `"Metrovise Security" <${user}>`,
        to: toEmail,
        subject: `🔐 Your Metrovise Verification Code: ${otp}`,
        text: `Your Metrovise verification code is: ${otp}. This code is valid for 10 minutes. If you did not request this code, please ignore this email.`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #171726; color: #f2e9e4; margin: 0; padding: 24px 12px; }
              .card { max-width: 480px; margin: 0 auto; background: #22223b; border-radius: 16px; padding: 36px 24px; border: 1px solid #4a4e69; box-shadow: 0 12px 32px rgba(0,0,0,0.5); text-align: center; }
              .badge { display: inline-block; background: rgba(201, 173, 167, 0.15); color: #c9ada7; font-weight: 800; font-size: 11px; padding: 5px 12px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.8px; border: 1px solid rgba(201, 173, 167, 0.3); margin-bottom: 16px; }
              .title { font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 8px 0; }
              .sub { font-size: 14px; color: #c9ada7; line-height: 1.5; margin: 0 0 24px 0; }
              .otp-container { background: #1d1d2f; border: 1px dashed #9a8c98; border-radius: 14px; padding: 20px; margin: 24px 0; box-shadow: inset 0 2px 6px rgba(0,0,0,0.4); }
              .otp-code { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #f2e9e4; margin: 0; }
              .info { font-size: 13px; color: #9a8c98; line-height: 1.5; margin-bottom: 20px; }
              .footer { font-size: 11.5px; color: #6d6477; border-top: 1px solid #4a4e69; padding-top: 20px; margin-top: 24px; }
            </style>
          </head>
          <body>
            <div class="card">
              <span class="badge">Metrovise Security</span>
              <h1 class="title">Verify Your Email</h1>
              <p class="sub">Enter this 6-digit one-time passcode to authenticate your session.</p>
              <div class="otp-container">
                <div class="otp-code">${otp}</div>
              </div>
              <p class="info">
                ⏳ This code is valid for <b>10 minutes</b> and can only be used once.<br>
                If you did not request this verification code, you can safely ignore this email.
              </p>
              <div class="footer">
                Metrovise Agency Operating System & Financial ERP (metrovise.com)<br>
                Protected with 256-bit TLS Encryption
              </div>
            </div>
          </body>
          </html>
        `,
      };
      await transporter.sendMail(mailOptions);
      return { provider: 'gmail_smtp', sent: true, devMode: false };
    } catch (mErr) {
      console.warn('Nodemailer SMTP error in OTP dispatch:', mErr.message);
    }
  }

  // 3. Fallback: Dev Mode Console Output
  console.log(`\n======================================================`);
  console.log(`✉️  [DEV MODE] Verification OTP Email Triggered`);
  console.log(`📧 Target Email: ${toEmail}`);
  console.log(`🔑 Verification OTP for ${toEmail}: 👉  ${otp}  👈`);
  console.log(`======================================================\n`);
  return { provider: 'dev_console', devMode: true, sent: true };
}

/**
 * Sends a welcome invitation email to a newly added employee with their temporary password and employee portal login URL
 */
async function sendStaffInviteEmail({ toEmail, staffName, role, temporaryPassword, agencyName = 'Metrovise', loginUrl = 'http://localhost:3000' }) {
  const supabase = getSupabaseClient();
  const transporter = createTransporter();

  // Construct dedicated employee portal login URL
  const cleanLoginUrl = loginUrl.replace(/\/+$/, '');
  const employeePortalUrl = `${cleanLoginUrl}${cleanLoginUrl.includes('?') ? '&' : '?'}auth=login&role=employee&email=${encodeURIComponent(toEmail)}`;

  const subject = `🎉 Welcome to ${agencyName} — Staff Portal Access & Credentials`;
  const plainText = `Hi ${staffName},\n\nYou have been invited to join ${agencyName} on Metrovise as ${role}.\n\nPortal: Metrovise Staff Workspace (Employee Portal)\nAccess Level: Restricted Employee Access (Attendance, Deliverables, Shoots & Slips)\nEmployee Portal Login URL: ${employeePortalUrl}\nEmail: ${toEmail}\nTemporary Password: ${temporaryPassword}\n\nPlease use this temporary password to log in. You will be prompted to set your personal password upon initial sign-in.\n\nWarm regards,\n${agencyName} Team`;
  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainText)}`;
  const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainText)}`;

  // 1. Try Supabase Auth invite if Supabase is connected
  if (supabase) {
    try {
      if (supabaseServiceRole && supabase.auth && supabase.auth.admin) {
        const { data: invData, error: invErr } = await supabase.auth.admin.inviteUserByEmail(toEmail, {
          data: {
            name: staffName,
            role: 'employee',
            staff_role: role,
            temporary_password: temporaryPassword,
            agency_name: agencyName
          },
          redirectTo: employeePortalUrl
        });
        if (!invErr) {
          console.log(`✉️ [SUPABASE ADMIN INVITE] Successfully sent employee invite to ${toEmail}`);
          return { provider: 'supabase_admin', sent: true, devMode: false, gmailComposeUrl, mailtoUrl, plainText, employeePortalUrl };
        } else {
          console.warn('Supabase admin.inviteUserByEmail note:', invErr.message);
        }
      }

      // Fallback to Supabase OTP / Magic Link
      const { data: otpData, error: otpErr } = await supabase.auth.signInWithOtp({
        email: toEmail,
        options: {
          data: {
            name: staffName,
            role: 'employee',
            staff_role: role,
            temporary_password: temporaryPassword,
            agency_name: agencyName
          },
          emailRedirectTo: employeePortalUrl
        }
      });
      if (!otpErr) {
        console.log(`✉️ [SUPABASE AUTH] Successfully sent onboarding invite to ${toEmail}`);
        return { provider: 'supabase_auth', sent: true, devMode: false, gmailComposeUrl, mailtoUrl, plainText, employeePortalUrl };
      } else {
        console.warn('Supabase signInWithOtp note:', otpErr.message);
      }
    } catch (sbErr) {
      console.warn('Supabase invite dispatch error:', sbErr.message);
    }
  }

  // 2. Try Nodemailer / Gmail SMTP Transport
  if (transporter) {
    try {
      const mailOptions = {
        from: `"${agencyName} via Metrovise" <${user}>`,
        to: toEmail,
        subject: subject,
        text: plainText,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #171726; color: #f2e9e4; margin: 0; padding: 24px 12px; }
              .card { max-width: 520px; margin: 0 auto; background: #22223b; border-radius: 16px; padding: 36px 26px; border: 1px solid #4a4e69; box-shadow: 0 12px 32px rgba(0,0,0,0.5); }
              .badge { display: inline-block; background: rgba(52, 211, 153, 0.15); color: #34d399; font-weight: 800; font-size: 11px; padding: 5px 12px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.8px; border: 1px solid rgba(52, 211, 153, 0.3); margin-bottom: 16px; }
              .title { font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 8px 0; }
              .sub { font-size: 14px; color: #c9ada7; line-height: 1.6; margin: 0 0 20px 0; }
              .cred-box { background: #1d1d2f; border: 1px solid #4a4e69; border-radius: 12px; padding: 20px; margin: 20px 0; }
              .cred-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(201,173,167,0.15); font-size: 13px; }
              .cred-row:last-child { border-bottom: none; }
              .cred-label { color: #9a8c98; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
              .cred-val { color: #f2e9e4; font-weight: 700; font-family: monospace; }
              .cred-pass { color: #34d399; font-size: 16px; font-weight: 800; }
              .btn-login { display: block; width: 100%; box-sizing: border-box; text-align: center; background: linear-gradient(135deg, #4a4e69, #22223b); border: 1px solid #c9ada7; color: #f2e9e4 !important; text-decoration: none; padding: 14px; border-radius: 10px; font-weight: 800; font-size: 14px; margin: 24px 0 16px 0; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
              .features { background: rgba(201, 173, 167, 0.08); border-radius: 10px; padding: 14px; margin-top: 20px; font-size: 12px; color: #c9ada7; line-height: 1.8; }
              .footer { font-size: 11.5px; color: #6d6477; border-top: 1px solid #4a4e69; padding-top: 20px; margin-top: 24px; text-align: center; }
            </style>
          </head>
          <body>
            <div class="card">
              <div style="text-align:center;">
                <span class="badge">Staff Workspace Onboarding</span>
                <h1 class="title">Welcome to ${agencyName}!</h1>
                <p class="sub">Hi <b>${staffName}</b>, you have been invited to join the team on Metrovise as <b>${role}</b>.</p>
              </div>

              <div class="cred-box">
                <div class="cred-row">
                  <span class="cred-label">Portal Access</span>
                  <span class="cred-val" style="color:#34d399;">Employee Portal Only</span>
                </div>
                <div class="cred-row">
                  <span class="cred-label">Login Email ID</span>
                  <span class="cred-val">${toEmail}</span>
                </div>
                <div class="cred-row">
                  <span class="cred-label">Role Assigned</span>
                  <span class="cred-val" style="color:#c9ada7;">${role}</span>
                </div>
                <div class="cred-row">
                  <span class="cred-label">Temporary Password</span>
                  <span class="cred-val cred-pass">${temporaryPassword}</span>
                </div>
              </div>

              <a href="${employeePortalUrl}" class="btn-login" target="_blank">Sign In to Your Employee Portal ➔</a>

              <div class="features">
                <b>🚀 What you can do in your Staff Portal:</b><br>
                • 🕒 <b>Daily Punch Clock</b>: Record your attendance & work hours with 1 tap.<br>
                • 🎬 <b>Creative Studio & Tasks</b>: Track your assigned video shoots, editing queues & deadlines.<br>
                • 💵 <b>Salary Slips & Dues</b>: View paid salaries, bonuses & monthly attendance records.<br>
                • 🔐 <b>Secure Account</b>: You will be prompted to create your new personal password upon first login.
              </div>

              <div class="footer">
                ${agencyName} · Powered by Metrovise Agency Business OS (metrovise.com)<br>
                Protected with Enterprise TLS & JWT Security
              </div>
            </div>
          </body>
          </html>
        `,
      };
      await transporter.sendMail(mailOptions);
      return { provider: 'gmail_smtp', sent: true, devMode: false, gmailComposeUrl, mailtoUrl, plainText, employeePortalUrl };
    } catch (mErr) {
      console.warn('Nodemailer SMTP error in staff invite:', mErr.message);
    }
  }

  // 3. Dev / Client launcher fallback
  console.log(`\n======================================================`);
  console.log(`✉️  [DEV MODE] Staff Invite Triggered`);
  console.log(`👤 Employee: ${staffName} (${role})`);
  console.log(`📧 Email: ${toEmail}`);
  console.log(`🔑 Temporary Password: 👉  ${temporaryPassword}  👈`);
  console.log(`🔗 Employee Portal Login URL: ${employeePortalUrl}`);
  console.log(`======================================================\n`);

  return {
    provider: 'client_launcher',
    devMode: true,
    sent: true,
    gmailComposeUrl,
    mailtoUrl,
    plainText,
    employeePortalUrl
  };
}

module.exports = {
  createTransporter,
  sendOtpEmail,
  sendStaffInviteEmail,
  getSupabaseClient
};
