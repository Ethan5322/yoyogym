// Professional South African gym membership Terms & Conditions used in the
// membership PDF. CPA + POPIA aligned. `name` is the gym's trading name.
// (The in-app registration agreement text is editable in Admin → Settings;
// this is the comprehensive contract printed on the member's document.)
export function gymTerms(name) {
  const G = name || 'the Gym';
  return [
    {
      h: 'Membership Agreement & Eligibility',
      b: `This agreement is entered into between ${G} ("the Gym") and the member named on this document ("the Member"). Membership is personal and non-transferable. Members must be at least 16 years of age; members under 18 require the consent of a parent or legal guardian. By registering, the Member warrants that the information provided is true and accurate.`,
    },
    {
      h: 'Fees & Debit Order Authorisation',
      b: `The Member agrees to pay the joining/activation fee and the recurring membership fee applicable to the selected plan. For monthly memberships, the Member authorises ${G} to collect the agreed fee by debit order or card on the agreed billing date each month until cancelled in accordance with this agreement. Fees may be reviewed annually; the Member will be given reasonable prior notice of any increase.`,
    },
    {
      h: 'Contract Term & Renewal',
      b: `Fixed-term memberships run for the period selected at registration. Unless cancelled, month-to-month memberships continue until terminated by either party. At the end of a fixed term the membership may continue on a month-to-month basis at the prevailing rate unless renewed or cancelled.`,
    },
    {
      h: 'Cancellation Policy (Consumer Protection Act)',
      b: `In line with the Consumer Protection Act, the Member may cancel this agreement by giving 20 (twenty) business days' written notice to ${G}. Notice must be submitted to reception or via the contact details provided. Fees remain payable during the notice period. Any prepaid, unused portion will be handled in accordance with applicable law.`,
    },
    {
      h: 'Early Termination',
      b: `Where a fixed-term contract is cancelled before its end date, ${G} may impose a reasonable cancellation penalty as permitted by the Consumer Protection Act, taking into account the duration remaining and any benefits/discounts already received by the Member.`,
    },
    {
      h: 'Failed Payments & Suspension',
      b: `If a scheduled payment fails, ${G} may re-attempt collection. Should payment remain outstanding after retry, access may be suspended until the account is brought up to date. The Member remains liable for arrears accrued during any period of suspension.`,
    },
    {
      h: 'Freezing of Membership',
      b: `Memberships may be frozen for valid reasons (e.g. medical or travel) at the Gym's discretion and subject to any applicable administration fee and conditions communicated at the time of the request.`,
    },
    {
      h: 'Health, Safety & Medical Clearance (PAR-Q)',
      b: `The Member confirms completion of the Physical Activity Readiness Questionnaire (PAR-Q). Where any response indicates a potential health risk, the Member undertakes to obtain medical clearance from a registered medical practitioner before participating. The Member must disclose any condition that may affect their safe participation and must exercise within their own limits.`,
    },
    {
      h: 'Assumption of Risk',
      b: `The Member acknowledges that physical exercise carries inherent risks, including the risk of injury, illness or, in rare cases, death. The Member voluntarily assumes all such risks associated with the use of the facilities, equipment, classes and services.`,
    },
    {
      h: 'Indemnity & Waiver of Liability',
      b: `To the maximum extent permitted by South African law, the Member indemnifies and holds harmless ${G}, its owners, employees, trainers and agents against any injury, illness, loss, theft or damage arising from the Member's use of the facilities, equipment or services, save where caused by the gross negligence or wilful misconduct of the Gym.`,
    },
    {
      h: 'Code of Conduct & Gym Rules',
      b: `The Member agrees to comply with all posted gym rules and reasonable instructions of staff, to use equipment correctly and safely, to wipe down equipment after use, to wear appropriate attire and footwear, and to treat staff and other members with respect. ${G} may suspend or terminate membership for serious or repeated breaches of conduct without refund.`,
    },
    {
      h: 'Use of Facilities & Equipment',
      b: `Facilities are used at the Member's own risk. ${G} may temporarily close areas or remove equipment for maintenance, and may amend operating hours and class schedules. The Member must report faulty equipment to staff and must not use equipment that is marked out of order.`,
    },
    {
      h: 'Personal Belongings & Lockers',
      b: `${G} is not responsible for the loss of or damage to personal belongings on the premises. Lockers, where provided, are for use during a visit only and must be cleared on departure unless a locker rental has been arranged.`,
    },
    {
      h: 'Guests & Access Control',
      b: `Guest access is subject to the Gym's guest policy and applicable fees. Access is granted on presentation of a valid membership/verification credential. The Member may not permit unauthorised access using their membership credentials.`,
    },
    {
      h: 'Protection of Personal Information (POPIA)',
      b: `${G} processes the Member's personal information solely to administer the membership, payments, health-and-safety screening and communications, in accordance with the Protection of Personal Information Act, 2013. Information is stored securely and is not sold. The Member may request access to, correction of, or deletion of their personal information at any time.`,
    },
    {
      h: 'Communications',
      b: `The Member consents to receiving service-related communications (such as payment receipts, class reminders and membership notices) by email, WhatsApp or SMS. The Member may opt out of non-essential marketing communications at any time.`,
    },
    {
      h: 'Amendments',
      b: `${G} may amend these terms and the gym rules from time to time. Material changes will be communicated to the Member, and continued use of the facilities constitutes acceptance of the amended terms.`,
    },
    {
      h: 'Governing Law',
      b: `This agreement is governed by and construed in accordance with the laws of the Republic of South Africa, and is subject to the Consumer Protection Act and the Protection of Personal Information Act.`,
    },
  ];
}
