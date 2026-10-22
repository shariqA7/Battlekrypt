// The waiver a guardian reads and signs. The exact text is saved with each consent,
// so changing it later never changes what someone agreed to. Bump WAIVER_VERSION
// whenever the wording changes. DRAFT: have a lawyer review before turning consent on.
export const WAIVER_VERSION = "2026-10-v2";

export function waiverParagraphs(supportEmail: string): string[] {
  return [
    "I am the parent or legal guardian of the player named on this page.",
    "I give permission for my child to have a BattleKrypt account and to take part in tournaments, leagues, daily scrims and challenges on BattleKrypt. This includes competing, appearing in results, standings and rankings, and having matches streamed or recorded by the organizer. Until I approve, my child can browse BattleKrypt but cannot join any of these.",
    `This permission lasts for one year from the date I sign. I can withdraw it at any time, using the link in the confirmation email I will receive, or by emailing ${supportEmail}. If I withdraw, my child's upcoming entries are cancelled and they cannot enter anything new until I approve again. Results already recorded stay in the standings.`,
    "Any prize my child wins will be paid to me, to the payment account I provide, and not to my child. I understand the organizer or challenge poster who owes the prize is responsible for paying it, and that BattleKrypt does not hold or pay out prizes. I can change my payment details at any time from the same confirmation email.",
    "I understand that BattleKrypt is a platform, and that each organizer runs their own tournaments and is responsible for them. I have read the BattleKrypt Terms and Conditions and Privacy Policy.",
    "I understand BattleKrypt will keep a record of this consent (my name, email address, IP address and the time) for as long as it is needed to show that I gave it, and will keep the payment details I give only to pay prizes to me.",
  ];
}

export function waiverText(supportEmail: string): string {
  return waiverParagraphs(supportEmail).join("\n\n");
}
