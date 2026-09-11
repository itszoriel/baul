import { Body, Container, Head, Heading, Hr, Html, Link, Preview, Text } from "react-email";

interface ActionEmailProps {
  vaultName: string;
  actionUrl: string;
  kind: "invite" | "recovery" | "recovery-verify";
}

/** A tactile archival letter containing a short-lived action link, never a key. */
export default function KeyEmail({ vaultName, actionUrl, kind }: ActionEmailProps) {
  const invite = kind === "invite";
  const verification = kind === "recovery-verify";
  return (
    <Html>
      <Head />
      <Preview>{invite ? `An invitation to keep “${vaultName}.”` : verification ? `Confirm the recovery email for “${vaultName}.”` : `Confirm recovery for “${vaultName}.”`}</Preview>
      <Body style={{ backgroundColor: "#17130f", fontFamily: "Georgia, 'Times New Roman', serif", padding: "32px 0" }}>
        <Container style={{ backgroundColor: "#f2e8d5", border: "1px solid #a88136", borderRadius: 12, maxWidth: 520, padding: 40 }}>
          <Text style={{ color: "#806526", fontSize: 12, letterSpacing: 4, margin: 0, textTransform: "uppercase" }}>
            Baul · Deed of Keeping
          </Text>
          <Heading style={{ color: "#2b2416", fontSize: 26, margin: "12px 0 4px" }}>
            {invite ? "You have been invited inside" : verification ? "Confirm this recovery email" : "Confirm key recovery"}
          </Heading>
          <Text style={{ color: "#5a4d33", fontSize: 15, lineHeight: "24px" }}>
            {invite
              ? `A keeper invited you to “${vaultName}.” This private link expires and works once. You will choose your keeper name and personal keeper phrase when you enter.`
              : verification
                ? `Confirm that this address can receive recovery links for “${vaultName}.” This does not reveal or change the permanent key.`
                : `Someone requested a replacement permanent key for “${vaultName}.” The current key still works and changes only after this private, single-use link is confirmed.`}
          </Text>
          <Link
            href={actionUrl}
            style={{ backgroundColor: "#6e2835", borderRadius: 999, color: "#f8f0df", display: "inline-block", fontSize: 15, margin: "20px 0", padding: "12px 28px", textDecoration: "none" }}
          >
            {invite ? "Accept invitation" : verification ? "Confirm recovery email" : "Confirm recovery"}
          </Link>
          <Hr style={{ borderColor: "#a88136", opacity: 0.45 }} />
          <Text style={{ color: "#7d704f", fontSize: 12, lineHeight: "20px" }}>
            If you did not expect this message, ignore it. No key or access changes when this email is ignored. Baul
            (bah-ool) is a Filipino treasure chest.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
