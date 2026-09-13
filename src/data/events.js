import { useEffect, useState } from 'react';
import { fetchEvents } from '../lib/sb.js';

// Everything the site knows about the festivals.
//
// ponytail: the seed below is what ships in the bundle, so the site renders
// instantly and works offline. When the Supabase tables exist, loadEvents()
// overlays whatever the committee has entered in admin. Nothing else in the
// app reads event storage — the admin section only has to touch this file.
export const EVENTS = [
  {
    slug: 'independence-day',
    thumb: '/assets/thumb-independence-day.png',
    title: 'Independence Day',
    telugu: 'స్వాతంత్ర్య దినోత్సవం',
    when: '15 August',
    line: 'Flag hoisting at the gate',
    blurb:
      'The committee and residents gather at the main gate before nine. The flag goes up, children sing, and sweets are handed out block by block before everyone leaves for the day.',
    accent: '#C2542A',
    cover: '/assets/independence-1.jpeg',
    photos: [
      '/assets/independence-1.jpeg',
      '/assets/independence-2.jpeg',
      '/assets/independence-3.jpeg',
      '/assets/independence-4.jpeg'
    ]
  },
  {
    slug: 'krishnashtami',
    thumb: '/assets/thumb-krishnashtami.png',
    title: 'Krishnashtami',
    telugu: 'శ్రీ కృష్ణాష్టమి',
    when: 'Sravana masam',
    line: 'Janmashtami Celebrations',
    blurb:
      'Little Krishnas in fancy dress through the morning, and the Dahi Handi (ఉట్టి) strung up high in the afternoon until it is finally broken. Prasadam goes to every household.',
    accent: '#1F5FA8',
    cover: '/assets/krishnashtami-2.jpeg',
    photos: [
      '/assets/krishnashtami.jpeg',
      '/assets/krishnashtami-2.jpeg',
      '/assets/krishnashtami-1.jpeg',
      '/assets/krishnashtami-4.jpeg',
      '/assets/krishnashtami-3.jpeg',
      '/assets/krishnashtami-5.jpeg',
      '/assets/krishnashtami-7.jpeg',
      '/assets/krishnashtami-8.jpeg'
    ]
  },
  {
    slug: 'ganesh-chaturthi',
    thumb: '/assets/thumb-ganesh-chaturthi.png',
    title: 'Ganesh Chaturthi',
    telugu: 'వినాయక చవితి',
    when: 'Bhadrapada masam',
    line: 'Nine days at the colony pandal',
    blurb:
      'Vinayaka is installed at the pandal on the first morning and stays nine days. Pooja twice a day, cultural evenings for the children, and an eco-friendly nimajjanam to close.',
    accent: '#B8862B',
    cover: '/assets/ganesha-1.jpeg',
    photos: ['/assets/ganesha-1.jpeg', '/assets/ganesha-2.jpeg', '/assets/ganesha-3.jpeg']
  }
];

export const getEvent = (slug) => EVENTS.find((e) => e.slug === slug);

// ---------------------------------------------------------------- live data
// The seed above renders immediately (and offline). If the Supabase tables are
// populated, they replace it on the first load and the result is reused for the
// rest of the session.
let live = null;
let pending = null;

// Both the seed above and the Supabase rows are stored oldest-first (the
// committee's own `sort`); every screen shows them newest-first, so the one
// funnel every screen reads through flips them here.
const desc = (r) => r.slice().reverse();

export function useEvents() {
  const [rows, setRows] = useState(() => desc(live || EVENTS));
  const [ready, setReady] = useState(Boolean(live));
  useEffect(() => {
    if (live) return;
    pending = pending || fetchEvents().catch(() => null);
    let alive = true;
    pending.then((r) => {
      // An event added in admin before its photos are uploaded keeps the
      // bundled ones, so a gallery never goes empty on a live update.
      if (r) live = r.map((e) => {
        const seed = EVENTS.find((s) => s.slug === e.slug);
        return seed && !e.photos.length ? { ...e, photos: seed.photos, cover: e.cover || seed.cover } : e;
      });
      if (alive) {
        if (live) setRows(desc(live));
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { events: rows, ready };
}
