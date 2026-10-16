// The waiver a guardian reads and signs. The exact text is saved with each consent,
// so changing it later never changes what someone agreed to. Bump WAIVER_VERSION
// whenever the wording changes. DRAFT: have a lawyer review before turning consent on.
export const WAIVER_VERSION = "2026-10-v1";

export function waiverParagraphs(supportEmail: string): string[] {
  return [
    "I am the parent or legal guardian of the player named on this page.",
    "I give permission for my child to take part in tournaments, leagues and daily scrims on BattleKrypt that ask for a parent or guardian's consent. This includes competing, appearing in results and standings, and having matches streamed or recorded by the organizer.",
    `This permission lasts for one year from the date I sign. I can withdraw it at any time by emailing ${supportEmail}.`,
    "Cash prizes on BattleKrypt are only for players aged 18 or over. I understand my child is not eligible to receive cash prizes. Any other prize is decided by the organizer.",
    "I understand that BattleKrypt is a platform, and that each organizer runs their own tournaments and is responsible for them. I have read the BattleKrypt Terms and Conditions and Privacy Policy.",
    "I understand BattleKrypt will keep a record of this consent (my name, email address, IP address and the time) for as long as it is needed to show that I gave it.",
  ];
}

export function waiverText(supportEmail: string): string {
  return waiverParagraphs(supportEmail).join("\n\n");
}
