// Family and group memberships (CLAUDE.md §41.1 Q3) — the rules, with no
// database.
//
// A family or group is several members with ONE payer. Each keeps their own
// membership number, card and check-in; the group only records who belongs
// together, who pays, and the owner's discount for the extra members. Staff
// capture payments at the gym as they always have (members do not pay online).

export const GROUP_PRICING_KEY = 'group_pricing';

export const DEFAULT_GROUP_PRICING = Object.freeze({ family_discount_pct: 10, group_discount_pct: 5, max_members: 6 });

const int = (v, lo, hi, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function cleanGroupPricing(value = {}) {
  return {
    family_discount_pct: int(value?.family_discount_pct, 0, 90, DEFAULT_GROUP_PRICING.family_discount_pct),
    group_discount_pct: int(value?.group_discount_pct, 0, 90, DEFAULT_GROUP_PRICING.group_discount_pct),
    max_members: int(value?.max_members, 2, 20, DEFAULT_GROUP_PRICING.max_members),
  };
}

export const GROUP_KINDS = ['family', 'group'];

/** What is wrong with adding a member to a group, or null. */
export function addProblem({ group, links = [], member, pricing, memberLinkedElsewhere = false }) {
  if (!group) return 'That family or group does not exist.';
  if (!member) return 'No member has that membership number.';
  if (links.some((l) => l.member_id === member.id)) return 'They are already in this family or group.';
  if (memberLinkedElsewhere) return 'They already belong to another family or group. Remove them there first.';
  if (links.length >= pricing.max_members) return `A family or group can have at most ${pricing.max_members} members.`;
  return null;
}

/** The discount an extra member gets, by kind. The payer pays in full. */
export function discountFor(kind, pricing) {
  return kind === 'group' ? pricing.group_discount_pct : pricing.family_discount_pct;
}
