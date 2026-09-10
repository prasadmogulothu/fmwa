import { useEffect, useState } from 'react';
import { fetchEvents } from '../lib/sb.js';

// Everything the site knows about the three festivals.
//
// ponytail: the seed below is what ships in the bundle, so the site renders
// instantly and works offline. When the Supabase tables exist, loadEvents()
// overlays whatever the committee has entered in admin. Nothing else in the
// app reads event storage — the admin section only has to touch this file.
export const EVENTS = [
  {
    slug: 'independence-day',
    title: 'Independence Day',
    telugu: 'స్వాతంత్ర్య దినోత్సవం',
    when: '15 August',
    line: 'Flag hoisting at the gate',
    blurb:
      'The committee and residents gather at the main gate before nine. The flag goes up, children sing, and sweets are handed out block by block before everyone leaves for the day.',
    accent: '#C2542A',
    cover: '/assets/id-1.jpeg',
    photos: ['/assets/id-1.jpeg', '/assets/id-2.jpeg']
  },
  {
    slug: 'krishnashtami',
    title: 'Krishnashtami',
    telugu: 'శ్రీ కృష్ణాష్టమి',
    when: 'Sravana masam',
    line: 'Uri Adi in the open plot',
    blurb:
      'Little Krishnas in fancy dress through the morning, the uri strung up high in the afternoon, and bhajans until the pot finally breaks. Prasadam goes to every household.',
    accent: '#1F5FA8',
    cover: '/assets/krishnashtami-2.jpeg',
    photos: [
      '/assets/krishnashtami-2.jpeg',
      '/assets/krishnashtami-1.jpeg',
      '/assets/krishnashtami-4.jpeg',
      '/assets/krishnashtami-3.jpeg'
    ]
  },
  {
    slug: 'ganesh-chaturthi',
    title: 'Ganesh Chaturthi',
    telugu: 'వినాయక చవితి',
    when: 'Bhadrapada masam',
    line: 'Nine days at the colony pandal',
    blurb:
      'Vinayaka is installed at the pandal on the first morning and stays nine days. Pooja twice a day, cultural evenings for the children, and an eco-friendly nimajjanam to close.',
    accent: '#B8862B',
    cover: '/assets/ganesh-1.jpeg',
    photos: ['/assets/ganesh-1.jpeg']
  }
];

export const getEvent = (slug) => EVENTS.find((e) => e.slug === slug);

// ---------------------------------------------------------------- live data
// The seed above renders immediately (and offline). If the Supabase tables are
// populated, they replace it on the first load and the result is reused for the
// rest of the session.
let live = null;
let pending = null;

export function useEvents() {
  const [rows, setRows] = useState(live || EVENTS);
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
        if (live) setRows(live);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  return { events: rows, ready };
}
