/*
 * Campsites across India that we could confirm are real and operating.
 *
 * Source: OpenStreetMap (© OpenStreetMap contributors, Open Database Licence,
 * https://www.openstreetmap.org/copyright): places tagged tourism=camp_site, with the
 * position and details as mapped there.
 *
 * Only campsites that pass all of these are listed:
 *   1. mapped on OpenStreetMap (which gives the position), and not marked disused or abandoned;
 *   2. have a website: their own, or their operator's official site (government-run camps);
 *   3. that website loads and names the campsite (checked on the date in `checked`);
 *   4. open to travellers (trek bases for one company's own groups are left out).
 * Of 1,292 named campsites mapped in India, most list no website or phone, and many
 * websites no longer load, so this list is short on purpose. Entries with only a phone
 * number, or whose site blocks checks, are left out rather than guessed at.
 * Most "caravan sites" mapped in India turned out to be mis-tagged (car dealers,
 * parking), so none are included.
 *
 * `vans` says what OpenStreetMap records: 'yes' means caravans/vans are allowed there;
 * otherwise it's a tent camp, and travellers should ask before arriving in a van.
 * Re-check links before launch and every few months: campsites close and change hands.
 */
window.App = window.App || {};
(() => {
  const CHECKED = '2026-09-29';
  const c = (osm, name, lat, lng, place, state, website, extra = {}) => ({ id: 'osm-' + osm.replace('/', '-'), osm, name, lat, lng, place, state, website, checked: CHECKED, ...extra });

  App.CAMPSITES = [
    c('node/4600301989', 'Adventuria Animal Path', 30.08159, 78.38352, 'near Rishikesh', 'Uttarakhand', 'https://www.adventuria.in/', { phone: '+91 97160 13332' }),
    c('node/4646598189', 'Backpackers Sundarbans Eco-Village', 22.15307, 88.85758, 'Sundarbans', 'West Bengal', 'https://tourdesundarbans.com/', { phone: '+91 62904 03668' }),
    c('node/5243640970', 'Gokarna Adventure', 14.55536, 74.30994, 'Gokarna', 'Karnataka', 'https://gokarnaadventure.com/', { phone: '+91 98861 90282' }),
    c('node/8557254117', 'Hail Himalayas Eco Tourism Camping', 31.02058, 77.15578, 'Shoghi, near Shimla', 'Himachal Pradesh', 'https://www.hailhimalayas.com/', { phone: '+91 70184 41631', facilities: ['Toilets', 'Power'] }),
    c('node/10753338921', 'Feel Alive Camps', 32.04309, 76.712, 'Bir', 'Himachal Pradesh', 'https://feelalivecamps.com/stay/'),
    c('node/10803817503', 'Lazy Monk Adventures', 32.09633, 76.76261, 'Bir–Billing', 'Himachal Pradesh', 'https://lazymonkadventure.com/', { phone: '+91 90153 03301', vans: 'no', facilities: ['Tents'] }),
    c('node/13350810301', 'Gypsys Paradiso Vattavada', 10.20209, 77.2406, 'Vattavada, near Munnar', 'Kerala', 'https://www.gypsysparadiso.in/', { phone: '+91 90377 97703', facilities: ['Wi-Fi'] }),
    c('way/665848641', 'Muthodi Nature Camp', 13.43557, 75.64249, 'Bhadra Tiger Reserve, Chikmagalur', 'Karnataka', 'https://www.karnataka.com/chikmagalur/bhadra-wildlife-sanctuary/', { note: 'Run by the Forest Department; tented stay with basic food and safari. Book at the Chikmagalur forest office.' }),
    c('way/1340013955', 'Camp Monk Bannerghatta', 12.78282, 77.5366, 'Bannerghatta, Bengaluru', 'Karnataka', 'https://campmonk.com/', { phone: '+91 95904 95495', vans: 'yes', facilities: ['Toilets', 'Tents'] }),
    // Run by Jungle Lodges & Resorts (Karnataka government); both camps are named on its site
    c('node/2496032563', 'Galibore Nature Camp', 12.282, 77.375, 'Cauvery Wildlife Sanctuary', 'Karnataka', 'https://www.junglelodges.com/', { note: 'Run by Jungle Lodges & Resorts (Government of Karnataka). Book through its website.' }),
    c('way/1015440691', 'Kali Adventure Camp', 15.240, 74.623, 'Dandeli', 'Karnataka', 'https://www.junglelodges.com/', { phone: '+91 82842 30266', note: 'Run by Jungle Lodges & Resorts (Government of Karnataka). Book through its website.' }),
    // Gujarat tourism tent cities, named on their official sites
    c('node/9271272718', 'Tent City Dhordo (Rann Utsav)', 23.804, 69.509, 'Dhordo, Kutch', 'Gujarat', 'https://www.rannutsav.com/', { note: 'Seasonal: open during Rann Utsav, roughly November to February. Book through the official site.' }),
    c('way/979581339', 'Tent City Narmada (Tent City 2)', 21.853, 73.722, 'Ekta Nagar, near the Statue of Unity', 'Gujarat', 'https://www.tentcitynarmada.com/', { note: 'Book through the official site.' })
  ];

  // Distance in km between two points (haversine)
  const km = (a, b) => {
    const r = (x) => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  };
  // Confirmed campsites within `radius` km of a destination, nearest first
  App.campsitesNear = (d, radius = 160) => (d ? App.CAMPSITES.map(s => ({ ...s, km: Math.round(km(d, s)) })).filter(s => s.km <= radius).sort((a, b) => a.km - b.km) : []);
  App.OSM_CREDIT = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
})();
