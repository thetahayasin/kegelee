@php($action = $purpose === 'reset' ? 'reset your password' : 'verify your email')
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#060810;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060810;padding:32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#0f131b;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
                    <tr>
                        <td style="padding:32px 32px 8px;">
                            <p style="margin:0;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:{{ $accent }};font-weight:700;">{{ $appName }}</p>
                            <h1 style="margin:14px 0 6px;font-size:24px;line-height:1.25;color:#ffffff;">Your code to {{ $action }}</h1>
                            <p style="margin:0;font-size:15px;line-height:1.6;color:#9aa3ad;">Enter this 6-digit code in the app to continue. It expires in 15 minutes.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 32px;">
                            <div style="background:rgba(193,255,114,0.10);border:1px solid {{ $accent }};border-radius:14px;padding:18px;text-align:center;">
                                <span style="font-size:38px;font-weight:800;letter-spacing:.35em;color:{{ $accent }};">{{ $code }}</span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 32px 32px;">
                            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>
                        </td>
                    </tr>
                </table>
                <p style="margin:18px 0 0;font-size:12px;color:#4b5563;">&copy; {{ date('Y') }} {{ $appName }}</p>
            </td>
        </tr>
    </table>
</body>
</html>
