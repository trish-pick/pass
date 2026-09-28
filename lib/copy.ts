/**
 * All product wording lives here, so it can be edited in one place and
 * checked against the language rules in CLAUDE.md section 2a.
 *
 * Never describe an audit result as "compliant", "certified", "approved",
 * meeting "standards", or "Passed". lib/copy.test.ts enforces this.
 */
export const copy = {
  product: {
    name: "PASS",
    fullName: "Pre-issue Audit & Sheet Scan",
    tagline: "Nothing leaves the office until it PASSes.",
    positioning: "PASS, the pre-issue audit and sheet scan for building design practices.",
  },

  /** Must appear on every audit results screen, every export cover page, onboarding and terms. */
  disclaimer:
    "PASS checks your drawings against your own practice requirements. It does not assess compliance with the NCC or Australian Standards.",

  audit: {
    runButton: "Run PASS",
    progress: (current: number, total: number) => `PASSing through sheet ${current} of ${total}`,
    noOutstandingItems: "No outstanding items found",
    aiFindingLabel: "Please verify",
  },

  nav: {
    newAudit: "New audit",
    projects: "Projects",
    audits: "Audit history",
    checklists: "Checklists",
    practiceProfile: "Practice profile",
    settings: "Settings",
    signOut: "Sign out",
  },

  signIn: {
    title: "Sign in",
    description: "We'll email you a link to sign in. No password needed.",
    emailLabel: "Email",
    submit: "Email me a sign-in link",
    sent: "Check your inbox. The sign-in link is on its way.",
    error: "We couldn't send the link. Please check the address and try again.",
    linkError: "That sign-in link has expired or already been used. Please request a new one.",
  },

  noOrganisation: {
    title: "You're not part of a practice yet",
    description:
      "Your account is signed in but isn't linked to a practice. Ask your practice owner to add you, then sign in again.",
  },

  newAudit: {
    title: "New audit",
    description: "Drop in a drawing set to check it against your practice requirements before it issues.",
    comingSoon: "Uploading and auditing drawing sets arrives in the next build phase.",
    recentAudits: "Recent audits",
    noRecentAudits: "No audits yet.",
  },

  projects: {
    title: "Projects",
    empty: "No projects yet.",
    emptyHint: "Projects appear here once you upload your first drawing set.",
    columns: {
      number: "Project no.",
      name: "Name",
      address: "Address",
    },
  },
} as const;
