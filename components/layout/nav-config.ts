// One definition of the main navigation, used by the desktop bar (NavLinks),
// the phone drawer (MobileMenu) and nothing else. Plain data so the server Nav
// can pass it to client components.

export interface NavChild {
  label: string;
  href: string;
  description: string;
}

export type NavItem =
  | { label: string; href: string }
  | { label: string; children: NavChild[]; matchPrefixes: string[] };

export function isGroup(item: NavItem): item is Extract<NavItem, { children: NavChild[] }> {
  return "children" in item;
}

const basePath = (href: string) => href.split(/[?#]/)[0];

export function pathMatches(pathname: string, href: string) {
  const base = basePath(href);
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function itemIsActive(pathname: string, item: NavItem) {
  return isGroup(item)
    ? item.matchPrefixes.some((p) => pathMatches(pathname, p))
    : pathMatches(pathname, item.href);
}

export function buildNav(flags: { challenges: boolean; giveaways: boolean }): NavItem[] {
  const play: NavItem = {
    label: "Play",
    matchPrefixes: ["/tournaments", "/scrims", "/challenges"],
    children: [
      { label: "All events", href: "/tournaments", description: "Everything open for registration" },
      { label: "Tournaments", href: "/tournaments?type=tournament", description: "Knockout and points-table events" },
      { label: "Leagues", href: "/tournaments?type=league", description: "Multi-week competitions" },
      { label: "Daily scrims", href: "/tournaments?type=scrim", description: "Practice matches, every day" },
      ...(flags.challenges
        ? [{ label: "Challenges", href: "/challenges", description: "Post or accept a one-on-one challenge" }]
        : []),
    ],
  };

  const community: NavItem = {
    label: "Community",
    matchPrefixes: ["/organizers", "/players", "/giveaways"],
    children: [
      { label: "Organizers", href: "/organizers", description: "Who is hosting, and how they are rated" },
      { label: "Players", href: "/players", description: "Find players and their profiles" },
      ...(flags.giveaways
        ? [{ label: "Giveaways", href: "/giveaways", description: "Free prizes from organizers" }]
        : []),
    ],
  };

  const plans: NavItem = {
    label: "Plans",
    matchPrefixes: ["/pricing", "/plans"],
    children: [
      { label: "Player plans", href: "/pricing#players", description: "Ad-free, verified, early access" },
      { label: "Club plans", href: "/pricing#clubs", description: "Bigger rosters, more teams" },
      { label: "Organizer plans", href: "/pricing#organizers", description: "Host more, with better tools" },
    ],
  };

  return [
    { label: "Games", href: "/games" },
    play,
    { label: "Live", href: "/live" },
    { label: "Rankings", href: "/rankings" },
    community,
    plans,
  ];
}
