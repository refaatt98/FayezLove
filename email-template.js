// قالب إيميل رمز التفعيل. {{code}} و{{to_email}} تُستبدل عند الإرسال.
module.exports = (code, to) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>رمز التفعيل</title>
<style>
  @media (max-width: 520px) {
    .card { width: 100% !important; }
    .pad { padding: 28px 18px !important; }
    .code { font-size: 28px !important; letter-spacing: 8px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F3;">
    <!-- شريط العلم -->
    <tr>
      <td style="padding:0;font-size:0;line-height:0;">
        <table role="presentation" dir="ltr" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="10%" height="6" style="background:#C8102E;"></td>
            <td width="30%" height="6" style="background:#14161a;"></td>
            <td width="30%" height="6" style="background:#ffffff;"></td>
            <td width="30%" height="6" style="background:#0B6B3A;"></td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="card" width="460" cellpadding="0" cellspacing="0"
               style="width:460px;max-width:460px;background:#ffffff;border:1px solid #E3DFD6;border-top:4px solid #0B6B3A;">
          <tr>
            <td class="pad" dir="rtl" align="center"
                style="padding:40px 36px;font-family:Cairo,Tahoma,Arial,sans-serif;color:#14161a;text-align:center;">

              <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#0B6B3A;">جامعة النجاح الوطنية</p>
              <h1 style="margin:0 0 24px;font-size:24px;font-weight:800;color:#14161a;">نظام الحضور الذكي</h1>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.9;color:#5b5f66;">
                مرحبًا دكتور،<br />
                استخدم الرمز التالي لتفعيل حسابك في نظام الحضور الذكي.
              </p>

              <!-- الرمز -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" dir="ltr"
                      style="background:#FAF8F3;border:1px dashed #0B6B3A;padding:20px 12px;">
                    <span class="code"
                          style="font-family:'Courier New',Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:12px;padding-left:12px;color:#14161a;">${code}</span>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0;font-size:13px;color:#5b5f66;">
                الرمز صالح لمدة <strong style="color:#14161a;">10 دقائق</strong> ويُستخدم مرة واحدة فقط.
              </p>

              <!-- تنبيه أمني -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td dir="rtl" style="border-right:3px solid #C8102E;background:#fdf3f4;padding:12px 14px;text-align:right;font-size:13px;line-height:1.8;color:#5b5f66;font-family:Cairo,Tahoma,Arial,sans-serif;">
                    لا تشارك هذا الرمز مع أي أحد. إن لم تطلب تفعيل الحساب فتجاهل هذه الرسالة، ولن يتغير شيء.
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#9a968c;">
                أُرسلت هذه الرسالة إلى <span dir="ltr">${to}</span>
              </p>
            </td>
          </tr>
        </table>

        <p dir="rtl" style="margin:20px 0 0;font-family:Cairo,Tahoma,Arial,sans-serif;font-size:12px;color:#9a968c;text-align:center;">
          تصميم: <strong style="color:#0B6B3A;">Fayez Ghaith</strong> · <span dir="ltr">@fayezghaith</span>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
