import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-[380px]">
        <p className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2">
          Set a new password
        </p>
        <p className="font-sans text-[14px] text-bk-body mb-7">
          Choose a new password for your account.
        </p>
        <div
          className="rounded-2xl border border-bk-border p-7"
          style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}
        >
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
