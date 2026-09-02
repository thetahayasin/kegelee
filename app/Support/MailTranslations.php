<?php

namespace App\Support;

/**
 * The code email, in every language the app ships.
 *
 * There are exactly three transactional emails - reset a password, verify an
 * email, delete an account - and until now all three went out in English no
 * matter what language the app was set to. A password reset is the one message
 * somebody receives when they are already locked out and already frustrated,
 * so it is the worst possible place to switch languages on them.
 *
 * Held as a flat array rather than Laravel lang files for the same reason the
 * exercises and plans are hardcoded catalogues: it is content the backend
 * serves, not data anyone edits, and eight strings per language does not
 * justify 29 files. A locale can only be wrong here by missing a key, which
 * strings() fills from English and a test asserts against.
 *
 * `:app` is replaced with the app name. It is a placeholder rather than a
 * prefix bolted on afterwards because word order is not the same everywhere.
 */
class MailTranslations
{
    /** English, and the fallback for any key a translation is missing. */
    public const BASE = [
        'subject_reset'  => ":app - Password reset code",
        'subject_verify' => ":app - Email verification code",
        'subject_delete' => ":app - Account deletion code",
        'heading_reset'  => "Your code to reset your password",
        'heading_verify' => "Your code to verify your email",
        'heading_delete' => "Your code to delete your account",
        'body'           => "Enter this 6-digit code in the app to continue. It expires in 15 minutes.",
        'ignore'         => "If you didn't request this, you can safely ignore this email.",
    ];

    /** @var array<string,array<string,string>> */
    public const STRINGS = [
        'ar' => [
            'subject_reset'  => ":app - رمز إعادة تعيين كلمة المرور",
            'subject_verify' => ":app - رمز تأكيد البريد الإلكتروني",
            'subject_delete' => ":app - رمز حذف الحساب",
            'heading_reset'  => "رمزك لإعادة تعيين كلمة المرور",
            'heading_verify' => "رمزك لتأكيد بريدك الإلكتروني",
            'heading_delete' => "رمزك لحذف حسابك",
            'body'           => "أدخل هذا الرمز المكوّن من 6 أرقام في التطبيق للمتابعة. تنتهي صلاحيته خلال 15 دقيقة.",
            'ignore'         => "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.",
        ],
        'cs' => [
            'subject_reset'  => ":app - Kód pro obnovení hesla",
            'subject_verify' => ":app - Ověřovací kód e-mailu",
            'subject_delete' => ":app - Kód pro smazání účtu",
            'heading_reset'  => "Váš kód pro obnovení hesla",
            'heading_verify' => "Váš kód pro ověření e-mailu",
            'heading_delete' => "Váš kód pro smazání účtu",
            'body'           => "Zadejte tento šestimístný kód v aplikaci a pokračujte. Platnost vyprší za 15 minut.",
            'ignore'         => "Pokud jste o to nežádali, můžete tento e-mail klidně ignorovat.",
        ],
        'da' => [
            'subject_reset'  => ":app - Kode til nulstilling af adgangskode",
            'subject_verify' => ":app - Kode til bekræftelse af e-mail",
            'subject_delete' => ":app - Kode til sletning af konto",
            'heading_reset'  => "Din kode til at nulstille din adgangskode",
            'heading_verify' => "Din kode til at bekræfte din e-mail",
            'heading_delete' => "Din kode til at slette din konto",
            'body'           => "Indtast denne 6-cifrede kode i appen for at fortsætte. Den udløber om 15 minutter.",
            'ignore'         => "Hvis du ikke har bedt om dette, kan du roligt ignorere denne e-mail.",
        ],
        'de' => [
            'subject_reset'  => ":app - Code zum Zurücksetzen des Passworts",
            'subject_verify' => ":app - Code zur E-Mail-Bestätigung",
            'subject_delete' => ":app - Code zum Löschen des Kontos",
            'heading_reset'  => "Dein Code zum Zurücksetzen des Passworts",
            'heading_verify' => "Dein Code zur Bestätigung deiner E-Mail-Adresse",
            'heading_delete' => "Dein Code zum Löschen deines Kontos",
            'body'           => "Gib diesen 6-stelligen Code in der App ein, um fortzufahren. Er läuft in 15 Minuten ab.",
            'ignore'         => "Wenn du das nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.",
        ],
        'es' => [
            'subject_reset'  => ":app - Código para restablecer la contraseña",
            'subject_verify' => ":app - Código de verificación del correo",
            'subject_delete' => ":app - Código para eliminar la cuenta",
            'heading_reset'  => "Tu código para restablecer la contraseña",
            'heading_verify' => "Tu código para verificar tu correo",
            'heading_delete' => "Tu código para eliminar tu cuenta",
            'body'           => "Introduce este código de 6 dígitos en la app para continuar. Caduca en 15 minutos.",
            'ignore'         => "Si no lo has solicitado, puedes ignorar este correo sin problema.",
        ],
        'es-419' => [
            'subject_reset'  => ":app - Código para restablecer la contraseña",
            'subject_verify' => ":app - Código de verificación del correo",
            'subject_delete' => ":app - Código para eliminar la cuenta",
            'heading_reset'  => "Tu código para restablecer la contraseña",
            'heading_verify' => "Tu código para verificar tu correo",
            'heading_delete' => "Tu código para eliminar tu cuenta",
            'body'           => "Ingresa este código de 6 dígitos en la app para continuar. Vence en 15 minutos.",
            'ignore'         => "Si no lo solicitaste, puedes ignorar este correo sin problema.",
        ],
        'fi' => [
            'subject_reset'  => ":app - Salasanan palautuskoodi",
            'subject_verify' => ":app - Sähköpostin vahvistuskoodi",
            'subject_delete' => ":app - Tilin poistokoodi",
            'heading_reset'  => "Koodisi salasanan palauttamiseen",
            'heading_verify' => "Koodisi sähköpostin vahvistamiseen",
            'heading_delete' => "Koodisi tilin poistamiseen",
            'body'           => "Syötä tämä 6-numeroinen koodi sovelluksessa jatkaaksesi. Se vanhenee 15 minuutissa.",
            'ignore'         => "Jos et pyytänyt tätä, voit jättää tämän viestin huomiotta.",
        ],
        'fr' => [
            'subject_reset'  => ":app - Code de réinitialisation du mot de passe",
            'subject_verify' => ":app - Code de vérification de l'e-mail",
            'subject_delete' => ":app - Code de suppression du compte",
            'heading_reset'  => "Votre code pour réinitialiser votre mot de passe",
            'heading_verify' => "Votre code pour vérifier votre e-mail",
            'heading_delete' => "Votre code pour supprimer votre compte",
            'body'           => "Saisissez ce code à 6 chiffres dans l'application pour continuer. Il expire dans 15 minutes.",
            'ignore'         => "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.",
        ],
        'he' => [
            'subject_reset'  => ":app - קוד לאיפוס הסיסמה",
            'subject_verify' => ":app - קוד לאימות האימייל",
            'subject_delete' => ":app - קוד למחיקת החשבון",
            'heading_reset'  => "הקוד שלך לאיפוס הסיסמה",
            'heading_verify' => "הקוד שלך לאימות האימייל",
            'heading_delete' => "הקוד שלך למחיקת החשבון",
            'body'           => "הזינו את הקוד בן 6 הספרות באפליקציה כדי להמשיך. הוא יפוג בעוד 15 דקות.",
            'ignore'         => "אם לא ביקשתם זאת, אפשר להתעלם מהודעה זו.",
        ],
        'hi' => [
            'subject_reset'  => ":app - पासवर्ड रीसेट कोड",
            'subject_verify' => ":app - ईमेल सत्यापन कोड",
            'subject_delete' => ":app - खाता हटाने का कोड",
            'heading_reset'  => "आपका पासवर्ड रीसेट करने का कोड",
            'heading_verify' => "आपका ईमेल सत्यापित करने का कोड",
            'heading_delete' => "आपका खाता हटाने का कोड",
            'body'           => "जारी रखने के लिए ऐप में यह 6 अंकों का कोड डालें. यह 15 मिनट में समाप्त हो जाता है.",
            'ignore'         => "अगर आपने इसका अनुरोध नहीं किया है, तो आप इस ईमेल को अनदेखा कर सकते हैं.",
        ],
        'hu' => [
            'subject_reset'  => ":app - Jelszó-visszaállítási kód",
            'subject_verify' => ":app - E-mail-ellenőrző kód",
            'subject_delete' => ":app - Fióktörlési kód",
            'heading_reset'  => "A kódod a jelszó visszaállításához",
            'heading_verify' => "A kódod az e-mail-cím ellenőrzéséhez",
            'heading_delete' => "A kódod a fiók törléséhez",
            'body'           => "Add meg ezt a 6 jegyű kódot az alkalmazásban a folytatáshoz. 15 perc múlva lejár.",
            'ignore'         => "Ha nem te kérted, nyugodtan hagyd figyelmen kívül ezt az e-mailt.",
        ],
        'id' => [
            'subject_reset'  => ":app - Kode atur ulang kata sandi",
            'subject_verify' => ":app - Kode verifikasi email",
            'subject_delete' => ":app - Kode hapus akun",
            'heading_reset'  => "Kode untuk mengatur ulang kata sandimu",
            'heading_verify' => "Kode untuk memverifikasi emailmu",
            'heading_delete' => "Kode untuk menghapus akunmu",
            'body'           => "Masukkan kode 6 digit ini di aplikasi untuk melanjutkan. Kode berlaku 15 menit.",
            'ignore'         => "Jika kamu tidak memintanya, abaikan saja email ini.",
        ],
        'it' => [
            'subject_reset'  => ":app - Codice per reimpostare la password",
            'subject_verify' => ":app - Codice di verifica email",
            'subject_delete' => ":app - Codice per eliminare l'account",
            'heading_reset'  => "Il tuo codice per reimpostare la password",
            'heading_verify' => "Il tuo codice per verificare la tua email",
            'heading_delete' => "Il tuo codice per eliminare l'account",
            'body'           => "Inserisci questo codice di 6 cifre nell'app per continuare. Scade tra 15 minuti.",
            'ignore'         => "Se non hai richiesto tu questa operazione, puoi ignorare questa email.",
        ],
        'ja' => [
            'subject_reset'  => ":app - パスワード再設定コード",
            'subject_verify' => ":app - メールアドレス確認コード",
            'subject_delete' => ":app - アカウント削除コード",
            'heading_reset'  => "パスワードを再設定するためのコード",
            'heading_verify' => "メールアドレスを確認するためのコード",
            'heading_delete' => "アカウントを削除するためのコード",
            'body'           => "アプリでこの6桁のコードを入力して続行してください。15分で有効期限が切れます。",
            'ignore'         => "このリクエストに心当たりがない場合は、このメールを無視してください。",
        ],
        'ko' => [
            'subject_reset'  => ":app - 비밀번호 재설정 코드",
            'subject_verify' => ":app - 이메일 인증 코드",
            'subject_delete' => ":app - 계정 삭제 코드",
            'heading_reset'  => "비밀번호를 재설정하기 위한 코드",
            'heading_verify' => "이메일을 인증하기 위한 코드",
            'heading_delete' => "계정을 삭제하기 위한 코드",
            'body'           => "계속하려면 앱에 이 6자리 코드를 입력하세요. 15분 후에 만료됩니다.",
            'ignore'         => "요청하지 않으셨다면 이 메일은 무시하셔도 됩니다.",
        ],
        'nl' => [
            'subject_reset'  => ":app - Code om je wachtwoord te herstellen",
            'subject_verify' => ":app - Code om je e-mail te bevestigen",
            'subject_delete' => ":app - Code om je account te verwijderen",
            'heading_reset'  => "Je code om je wachtwoord te herstellen",
            'heading_verify' => "Je code om je e-mail te bevestigen",
            'heading_delete' => "Je code om je account te verwijderen",
            'body'           => "Voer deze code van 6 cijfers in de app in om verder te gaan. Hij verloopt over 15 minuten.",
            'ignore'         => "Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.",
        ],
        'no' => [
            'subject_reset'  => ":app - Kode for tilbakestilling av passord",
            'subject_verify' => ":app - Kode for bekreftelse av e-post",
            'subject_delete' => ":app - Kode for sletting av konto",
            'heading_reset'  => "Koden din for å tilbakestille passordet",
            'heading_verify' => "Koden din for å bekrefte e-posten",
            'heading_delete' => "Koden din for å slette kontoen",
            'body'           => "Skriv inn denne 6-sifrede koden i appen for å fortsette. Den utløper om 15 minutter.",
            'ignore'         => "Hvis du ikke ba om dette, kan du trygt se bort fra denne e-posten.",
        ],
        'pl' => [
            'subject_reset'  => ":app - Kod resetowania hasła",
            'subject_verify' => ":app - Kod weryfikacji e-maila",
            'subject_delete' => ":app - Kod usunięcia konta",
            'heading_reset'  => "Twój kod do zresetowania hasła",
            'heading_verify' => "Twój kod do weryfikacji e-maila",
            'heading_delete' => "Twój kod do usunięcia konta",
            'body'           => "Wpisz ten 6-cyfrowy kod w aplikacji, aby kontynuować. Wygasa po 15 minutach.",
            'ignore'         => "Jeśli to nie Ty, możesz zignorować tę wiadomość.",
        ],
        'pt-BR' => [
            'subject_reset'  => ":app - Código para redefinir a senha",
            'subject_verify' => ":app - Código de verificação do e-mail",
            'subject_delete' => ":app - Código para excluir a conta",
            'heading_reset'  => "Seu código para redefinir a senha",
            'heading_verify' => "Seu código para verificar seu e-mail",
            'heading_delete' => "Seu código para excluir sua conta",
            'body'           => "Digite este código de 6 dígitos no app para continuar. Ele expira em 15 minutos.",
            'ignore'         => "Se você não pediu isso, pode ignorar este e-mail.",
        ],
        'ro' => [
            'subject_reset'  => ":app - Cod pentru resetarea parolei",
            'subject_verify' => ":app - Cod pentru verificarea e-mailului",
            'subject_delete' => ":app - Cod pentru ștergerea contului",
            'heading_reset'  => "Codul tău pentru resetarea parolei",
            'heading_verify' => "Codul tău pentru verificarea e-mailului",
            'heading_delete' => "Codul tău pentru ștergerea contului",
            'body'           => "Introdu acest cod din 6 cifre în aplicație pentru a continua. Expiră în 15 minute.",
            'ignore'         => "Dacă nu tu ai cerut asta, poți ignora acest e-mail.",
        ],
        'ru' => [
            'subject_reset'  => ":app - Код для сброса пароля",
            'subject_verify' => ":app - Код для подтверждения почты",
            'subject_delete' => ":app - Код для удаления аккаунта",
            'heading_reset'  => "Ваш код для сброса пароля",
            'heading_verify' => "Ваш код для подтверждения почты",
            'heading_delete' => "Ваш код для удаления аккаунта",
            'body'           => "Введите этот 6-значный код в приложении, чтобы продолжить. Он действует 15 минут.",
            'ignore'         => "Если вы этого не запрашивали, просто проигнорируйте это письмо.",
        ],
        'sk' => [
            'subject_reset'  => ":app - Kód na obnovenie hesla",
            'subject_verify' => ":app - Overovací kód e-mailu",
            'subject_delete' => ":app - Kód na zmazanie účtu",
            'heading_reset'  => "Váš kód na obnovenie hesla",
            'heading_verify' => "Váš kód na overenie e-mailu",
            'heading_delete' => "Váš kód na zmazanie účtu",
            'body'           => "Zadajte tento šesťmiestny kód v aplikácii a pokračujte. Platnosť vyprší o 15 minút.",
            'ignore'         => "Ak ste o to nežiadali, tento e-mail môžete pokojne ignorovať.",
        ],
        'sv' => [
            'subject_reset'  => ":app - Kod för återställning av lösenord",
            'subject_verify' => ":app - Kod för verifiering av e-post",
            'subject_delete' => ":app - Kod för radering av konto",
            'heading_reset'  => "Din kod för att återställa lösenordet",
            'heading_verify' => "Din kod för att verifiera din e-post",
            'heading_delete' => "Din kod för att radera ditt konto",
            'body'           => "Ange den här 6-siffriga koden i appen för att fortsätta. Den upphör att gälla om 15 minuter.",
            'ignore'         => "Om du inte begärde detta kan du bortse från det här mejlet.",
        ],
        'th' => [
            'subject_reset'  => ":app - รหัสรีเซ็ตรหัสผ่าน",
            'subject_verify' => ":app - รหัสยืนยันอีเมล",
            'subject_delete' => ":app - รหัสลบบัญชี",
            'heading_reset'  => "รหัสสำหรับรีเซ็ตรหัสผ่านของคุณ",
            'heading_verify' => "รหัสสำหรับยืนยันอีเมลของคุณ",
            'heading_delete' => "รหัสสำหรับลบบัญชีของคุณ",
            'body'           => "กรอกรหัส 6 หลักนี้ในแอปเพื่อดำเนินการต่อ รหัสจะหมดอายุใน 15 นาที",
            'ignore'         => "หากคุณไม่ได้ทำรายการนี้ คุณสามารถเพิกเฉยต่ออีเมลนี้ได้",
        ],
        'tr' => [
            'subject_reset'  => ":app - Parola sıfırlama kodu",
            'subject_verify' => ":app - E-posta doğrulama kodu",
            'subject_delete' => ":app - Hesap silme kodu",
            'heading_reset'  => "Parolanı sıfırlamak için kodun",
            'heading_verify' => "E-postanı doğrulamak için kodun",
            'heading_delete' => "Hesabını silmek için kodun",
            'body'           => "Devam etmek için bu 6 haneli kodu uygulamaya gir. Kod 15 dakika içinde geçerliliğini yitirir.",
            'ignore'         => "Bunu sen istemediysen bu e-postayı yok sayabilirsin.",
        ],
        'uk' => [
            'subject_reset'  => ":app - Код для скидання пароля",
            'subject_verify' => ":app - Код для підтвердження пошти",
            'subject_delete' => ":app - Код для видалення акаунта",
            'heading_reset'  => "Ваш код для скидання пароля",
            'heading_verify' => "Ваш код для підтвердження пошти",
            'heading_delete' => "Ваш код для видалення акаунта",
            'body'           => "Введіть цей 6-значний код у застосунку, щоб продовжити. Він діє 15 хвилин.",
            'ignore'         => "Якщо ви цього не запитували, просто проігноруйте цей лист.",
        ],
        'vi' => [
            'subject_reset'  => ":app - Mã đặt lại mật khẩu",
            'subject_verify' => ":app - Mã xác minh email",
            'subject_delete' => ":app - Mã xóa tài khoản",
            'heading_reset'  => "Mã để đặt lại mật khẩu của bạn",
            'heading_verify' => "Mã để xác minh email của bạn",
            'heading_delete' => "Mã để xóa tài khoản của bạn",
            'body'           => "Nhập mã 6 chữ số này trong ứng dụng để tiếp tục. Mã hết hạn sau 15 phút.",
            'ignore'         => "Nếu bạn không yêu cầu điều này, bạn có thể bỏ qua email này.",
        ],
        'zh-Hans' => [
            'subject_reset'  => ":app - 密码重置验证码",
            'subject_verify' => ":app - 邮箱验证码",
            'subject_delete' => ":app - 账号注销验证码",
            'heading_reset'  => "重置密码的验证码",
            'heading_verify' => "验证邮箱的验证码",
            'heading_delete' => "注销账号的验证码",
            'body'           => "在应用中输入这个 6 位验证码即可继续。验证码 15 分钟后失效。",
            'ignore'         => "如果这不是你本人的操作，可以忽略这封邮件。",
        ],
    ];

    /**
     * Every string for one locale, with English filling any gap.
     *
     * Merged rather than looked up per key so a half-translated language still
     * produces a complete email instead of a blank line where a key is missing.
     */
    public static function strings(?string $locale): array
    {
        $resolved = Locales::resolve($locale);

        return array_merge(self::BASE, self::STRINGS[$resolved] ?? []);
    }

    /**
     * One string, with :app substituted.
     *
     * An unknown purpose falls back to 'verify' rather than rendering the key
     * name - the same defensive default the sender uses.
     */
    public static function get(?string $locale, string $key, string $appName = ''): string
    {
        $strings = self::strings($locale);
        $text = $strings[$key] ?? self::BASE[$key] ?? '';

        return str_replace(':app', $appName, $text);
    }
}
