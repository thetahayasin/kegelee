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
                        <td style="padding:32px 32px 24px;">
                            <p style="margin:0 0 16px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:{{ $accent }};font-weight:700;">{{ $appName }}</p>
                            <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#ffffff;">{{ $headline }}</h1>
                            <p style="margin:0;font-size:15px;line-height:1.6;color:#9aa3ad;">{{ $body }}</p>
                        </td>
                    </tr>
                    @if (!empty($detail))
                    <tr>
                        <td style="padding:0 32px 24px;">
                            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;">
                                <p style="margin:0;font-size:13px;line-height:1.6;color:#9aa3ad;">{{ $detail }}</p>
                            </div>
                        </td>
                    </tr>
                    @endif
                    @if (!empty($ctaLabel))
                    <tr>
                        <td style="padding:0 32px 32px;">
                            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">Questions? Reply to this email and we'll be happy to help.</p>
                        </td>
                    </tr>
                    @endif
                </table>
                <p style="margin:18px 0 0;font-size:12px;color:#4b5563;">&copy; {{ date('Y') }} {{ $appName }}. All rights reserved.</p>
            </td>
        </tr>
    </table>
</body>
</html>
