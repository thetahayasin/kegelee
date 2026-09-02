<!DOCTYPE html>
<html lang="{{ $lang }}" dir="{{ $dir }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#060810;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;" dir="{{ $dir }}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060810;padding:32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#0f131b;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;">
                    <tr>
                        {{-- text-align follows the script: an RTL email whose copy is
                             flush left reads as a broken template rather than a
                             translated one. The code block below stays centred in
                             both, because digits are neither. --}}
                        <td style="padding:32px 32px 8px;text-align:{{ $dir === 'rtl' ? 'right' : 'left' }};">
                            <p style="margin:0;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:{{ $accent }};font-weight:700;">{{ $appName }}</p>
                            <h1 style="margin:14px 0 6px;font-size:24px;line-height:1.25;color:#ffffff;">{{ $heading }}</h1>
                            <p style="margin:0;font-size:15px;line-height:1.6;color:#9aa3ad;">{{ $intro }}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 32px;">
                            {{-- dir=ltr on the code itself. A six digit code is read
                                 left to right in every language, and leaving it to
                                 inherit rtl reverses how it is spoken back. --}}
                            <div dir="ltr" style="background:rgba(193,255,114,0.10);border:1px solid {{ $accent }};border-radius:14px;padding:18px;text-align:center;">
                                <span style="font-size:38px;font-weight:800;letter-spacing:.35em;color:{{ $accent }};">{{ $code }}</span>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 32px 32px;text-align:{{ $dir === 'rtl' ? 'right' : 'left' }};">
                            <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">{{ $ignore }}</p>
                        </td>
                    </tr>
                </table>
                <p style="margin:18px 0 0;font-size:12px;color:#4b5563;">&copy; {{ date('Y') }} {{ $appName }}</p>
            </td>
        </tr>
    </table>
</body>
</html>
