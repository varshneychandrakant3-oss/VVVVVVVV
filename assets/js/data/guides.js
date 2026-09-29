/*
 * Trip guides: day-by-day plans for each suggested route, practical notes
 * (altitude, permits, fuel, network, roads) and van-friendly spots.
 *
 * Distances and driving times are approximate. Permit links point to official
 * government sites, checked on 29 Sep 2026; rules change, so travellers are told
 * to check before they go. Spots are demo data: generic places, not endorsements.
 */
window.App = window.App || {};
(() => {
  const day = (from, to, km, hours, extra = {}) => ({ from, to, km, hours, ...extra });
  App.TRIP_GUIDES = {
    ladakh: {
      practical: {
        altitude: 'Leh is at about 3,500 m. Spend your first 36–48 hours in Leh taking it easy before crossing the high passes — Khardung La and Chang La are above 5,300 m. Acute mountain sickness shows as headache, nausea or breathlessness at rest: stop climbing, and go lower if it gets worse.',
        permits: [
          { name: 'Inner Line Permit (Indian citizens) or Protected Area Permit (foreign nationals)', need: 'Needed for Nubra, Pangong, Tso Moriri, Hanle, Turtuk and other areas beyond Leh. Apply online and carry printed copies.', link: 'https://www.lahdclehpermit.in/', source: 'Leh District Permit Tracking System' },
          { name: 'District information and advisories', link: 'https://leh.nic.in/', source: 'District Leh' }
        ],
        fuel: 'On the Manali–Leh highway there is no fuel between Tandi (near Keylong) and Karu — roughly 365 km. Fill up in Leh and Diskit; there is no pump at Pangong. Carry a spare can.',
        network: 'Prepaid SIMs from outside Ladakh and Jammu & Kashmir don’t work here; postpaid Airtel, Jio and BSNL do. Expect no signal on long stretches between towns.',
        roads: 'Mostly paved with broken sections, afternoon water crossings on the Manali–Leh road, and snow on the passes early and late in the season. The highways usually open from about June to October.'
      },
      plans: {
        'Manali → Leh Highway': [
          day('Manali', 'Jispa', 140, 5, { alt: 3200, note: 'Through the Atal Tunnel, which skips the Rohtang climb.' }),
          day('Jispa', 'Sarchu', 90, 4, { alt: 4290, note: 'Over Baralacha La (about 4,890 m). Sleep lower at Jispa another night if anyone feels unwell.' }),
          day('Sarchu', 'Leh', 250, 9, { alt: 3500, note: 'Longest day, over Tanglang La (5,300 m+). Start at dawn; no fuel until Karu.' }),
          day('Leh', 'Leh', 0, 0, { note: 'Rest day to acclimatise. Walk the old town slowly; drink water.' }),
          day('Leh', 'Shey, Thiksey & Hemis', 90, 3, { note: 'Monasteries of the Indus valley, back to Leh.' })
        ],
        'Leh → Nubra → Pangong loop': [
          day('Leh', 'Hunder (Nubra)', 125, 5, { alt: 3100, note: 'Over Khardung La. Don’t linger at the top.' }),
          day('Hunder', 'Turtuk and back', 170, 5, { note: 'Balti village near the border; the road follows the Shyok river.' }),
          day('Hunder', 'Pangong Tso', 160, 6, { alt: 4250, note: 'Shyok road, rough in places. Nights are freezing — a heater helps.' }),
          day('Pangong Tso', 'Leh', 160, 5, { note: 'Over Chang La.' })
        ]
      },
      spots: [
        { name: 'Highway dhabas at Karu', type: 'dhaba', lat: 33.9290, lng: 77.7570, note: 'Food and truck parking; fuel nearby.' },
        { name: 'Old-town guesthouses with parking, Leh', type: 'homestay', lat: 34.1650, lng: 77.5850, note: 'Many allow a van in the courtyard.' },
        { name: 'Water refill point, Leh market', type: 'water', lat: 34.1642, lng: 77.5848, note: 'Refill bottles and tanks instead of buying plastic.' }
      ]
    },
    spiti: {
      practical: {
        altitude: 'Kaza is at about 3,800 m and Kunzum La about 4,590 m. Going up through Kinnaur (Shimla side) lets you acclimatise gradually; coming in over Kunzum from Manali is a much faster climb.',
        permits: [
          { name: 'Indian citizens: no permit needed', need: 'Carry ID; there are checkposts.', link: 'https://hplahaulspiti.nic.in/', source: 'District Lahaul & Spiti' },
          { name: 'Foreign nationals: Protected Area Permit', need: 'For the Kinnaur–Spiti border stretch, from the district administration.', link: 'https://hpkinnaur.nic.in/', source: 'District Kinnaur' }
        ],
        fuel: 'Fill up at Reckong Peo and Kaza. There’s no fuel between Kaza and Tandi over Kunzum La — about 200 km.',
        network: 'BSNL is the most reliable; Jio and Airtel work in Kaza and a few villages. Download maps offline.',
        roads: 'Narrow cliff roads in Kinnaur, and an unpaved, water-crossed stretch between Losar and Gramphu that usually opens only from mid-June to mid-October. Drive in daylight.'
      },
      plans: {
        'Shimla → Kinnaur → Kaza': [
          day('Shimla', 'Sarahan', 170, 6, { alt: 2165, note: 'Via Narkanda’s apple orchards.' }),
          day('Sarahan', 'Kalpa', 110, 4, { alt: 2960, note: 'Views of the Kinner Kailash range.' }),
          day('Kalpa', 'Nako', 105, 4, { alt: 3660, note: 'Cliff roads; the Sutlej and Spiti rivers meet at Khab.' }),
          day('Nako', 'Tabo', 65, 3, { alt: 3280, note: 'Thousand-year-old Tabo monastery.' }),
          day('Tabo', 'Kaza', 50, 2, { alt: 3800, note: 'Stop at Dhankar on the way.' }),
          day('Kaza', 'Key, Kibber & Langza', 60, 3, { note: 'High villages around Kaza; back the same day.' })
        ],
        'Kaza → Chandratal → Manali': [
          day('Kaza', 'Losar', 60, 2.5, { alt: 4080 }),
          day('Losar', 'Chandratal', 45, 3, { alt: 4300, note: 'Over Kunzum La on an unpaved road. Camp at the designated sites, not at the lake shore.' }),
          day('Chandratal', 'Manali', 120, 5, { note: 'Batal and Gramphu, then the Atal Tunnel.' })
        ]
      },
      spots: [
        { name: 'Dhaba stop at Losar', type: 'dhaba', lat: 32.4376, lng: 77.7597, note: 'Last hot meal before Kunzum La.' },
        { name: 'Homestays with parking, Kaza', type: 'homestay', lat: 32.2276, lng: 78.0710 },
        { name: 'Water refill, Kaza', type: 'water', lat: 32.2270, lng: 78.0720 }
      ]
    },
    himachal: {
      practical: {
        altitude: 'Manali is at about 2,000 m; Sissu, beyond the Atal Tunnel, about 3,100 m. Mild for most people.',
        permits: [
          { name: 'Rohtang Pass vehicle permit', need: 'Driving over Rohtang Pass needs a permit from the Kullu district administration, with limited numbers a day. The Atal Tunnel route to Sissu and Lahaul doesn’t need it.', link: 'https://hpkullu.nic.in/', source: 'District Kullu' }
        ],
        fuel: 'Plenty of pumps in the Kullu valley. Fill up in Manali before heading into Lahaul.',
        network: 'Good 4G in Kullu and Manali; patchy in the side valleys.',
        roads: 'Busy two-lane road with heavy peak-season traffic around Manali; snow at Solang and Sissu in winter. Landslides possible in the monsoon.'
      },
      plans: {
        'Kullu–Manali valley drive': [
          day('Bhuntar', 'Naggar', 45, 2, { note: 'Kullu town, then Naggar castle.' }),
          day('Naggar', 'Manali', 25, 1, { note: 'Old Manali and the Vashisht hot springs.' }),
          day('Manali', 'Sissu', 45, 2.5, { alt: 3100, note: 'Solang valley, then through the Atal Tunnel.' }),
          day('Sissu', 'Manali', 40, 2)
        ],
        'Parvati Valley escape': [
          day('Bhuntar', 'Kasol', 30, 1.5),
          day('Kasol', 'Manikaran & Barshaini', 30, 1.5, { note: 'Narrow road; park big vans at Manikaran.' }),
          day('Barshaini', 'Bhuntar', 60, 2.5)
        ]
      },
      spots: [
        { name: 'Dhabas at Sissu', type: 'dhaba', lat: 32.4810, lng: 77.1270 },
        { name: 'Homestays with parking, Naggar', type: 'homestay', lat: 32.1159, lng: 77.1655 },
        { name: 'Water refill, Manali', type: 'water', lat: 32.2432, lng: 77.1892 }
      ]
    },
    rishikesh: {
      practical: {
        altitude: 'Rishikesh is low (about 370 m); Chopta is about 2,700 m, with cold nights.',
        permits: [{ name: 'No permit needed for Rishikesh, Chopta or Auli', need: 'Some border valleys (such as Nelong) need permits from the district.', link: 'https://uttarakhandtourism.gov.in/', source: 'Uttarakhand Tourism' }],
        fuel: 'Fill up at Rudraprayag or Ukhimath before Chopta.',
        network: 'Good in Rishikesh; weak around Chopta.',
        roads: 'Highway widening in progress on the Char Dham routes; landslides are common in the monsoon (July–September). Drive in daylight.'
      },
      plans: {
        'Delhi → Rishikesh → Chopta': [
          day('Delhi', 'Rishikesh', 240, 6),
          day('Rishikesh', 'Shivpuri (rafting)', 30, 1),
          day('Rishikesh', 'Rudraprayag', 140, 5, { note: 'Along the Alaknanda; Devprayag confluence on the way.' }),
          day('Rudraprayag', 'Chopta', 75, 3, { alt: 2700, note: 'Hairpin bends through forest.' }),
          day('Chopta', 'Rudraprayag', 75, 3, { note: 'Morning Tungnath trek, then down.' })
        ]
      },
      spots: [
        { name: 'Highway dhabas, Rudraprayag', type: 'dhaba', lat: 30.2844, lng: 78.9811 },
        { name: 'Homestays, Chopta', type: 'homestay', lat: 30.4889, lng: 79.2167 },
        { name: 'Water & waste point, Rishikesh', type: 'water', lat: 30.0869, lng: 78.2676 }
      ]
    },
    goa: {
      practical: {
        altitude: 'Sea level.',
        permits: [{ name: 'No permits needed', link: 'https://goatourism.gov.in/', source: 'Department of Tourism, Goa' }],
        fuel: 'Pumps in every town.',
        network: 'Good coverage along the coast.',
        roads: 'Narrow village roads and tight parking in North Goa; heavy rain June–September. Park only where allowed — overnight parking on beaches is not permitted.'
      },
      plans: {
        'North to South coastal crawl': [
          day('Arambol', 'Anjuna', 20, 1), day('Anjuna', 'Panjim', 20, 1), day('Panjim', 'Colva', 35, 1.5), day('Colva', 'Agonda', 45, 1.5), day('Agonda', 'Palolem', 10, 0.5)
        ]
      },
      spots: [
        { name: 'Homestays with parking, Agonda', type: 'homestay', lat: 15.0445, lng: 73.9870 },
        { name: 'Water & waste point, Mapusa', type: 'water', lat: 15.5937, lng: 73.8142 },
        { name: 'Highway dhabas, Pernem', type: 'dhaba', lat: 15.7200, lng: 73.8000 }
      ]
    },
    kerala: {
      practical: {
        altitude: 'Coast at sea level; Munnar about 1,600 m.',
        permits: [{ name: 'No permits needed', link: 'https://www.keralatourism.org/', source: 'Kerala Tourism' }],
        fuel: 'Plenty of pumps.',
        network: 'Good, except deep in the Periyar forest.',
        roads: 'Narrow, busy roads; ghat roads to Munnar have hairpins. Heavy rain June–August.'
      },
      plans: {
        'Kochi → Munnar → Thekkady → Alleppey': [
          day('Kochi', 'Fort Kochi', 15, 1), day('Kochi', 'Munnar', 130, 4.5, { alt: 1600, note: 'Ghat road with hairpins.' }), day('Munnar', 'Munnar tea estates', 40, 2),
          day('Munnar', 'Thekkady', 90, 3.5), day('Thekkady', 'Periyar & spice farms', 20, 1), day('Thekkady', 'Alleppey', 140, 4), day('Alleppey', 'Kochi', 55, 1.5)
        ]
      },
      spots: [
        { name: 'Backwater homestays with parking, Alleppey', type: 'homestay', lat: 9.4981, lng: 76.3388 },
        { name: 'Tea estate stays, Munnar', type: 'homestay', lat: 10.0889, lng: 77.0595 },
        { name: 'Water & waste point, Kochi', type: 'water', lat: 9.9816, lng: 76.2999 }
      ]
    },
    rajasthan: {
      practical: {
        altitude: 'Low; desert heat from April to June (40 °C+). Travel October–March.',
        permits: [{ name: 'No permits needed', need: 'Areas right next to the border near Jaisalmer are restricted.', link: 'https://www.tourism.rajasthan.gov.in/', source: 'Rajasthan Tourism' }],
        fuel: 'Good on highways; sparse west of Jaisalmer towards the dunes.',
        network: 'Good in towns and on highways; weak in the dunes.',
        roads: 'Excellent highways; watch for cattle and camels, especially at night.'
      },
      plans: {
        'Royal Rajasthan loop': [
          day('Jaipur', 'Jaipur forts', 30, 1.5), day('Jaipur', 'Pushkar', 145, 3), day('Pushkar', 'Jodhpur', 190, 4), day('Jodhpur', 'Mehrangarh', 10, 0.5),
          day('Jodhpur', 'Jaisalmer', 285, 5), day('Jaisalmer', 'Sam dunes', 45, 1), day('Jaisalmer', 'Jodhpur', 285, 5),
          day('Jodhpur', 'Udaipur via Ranakpur', 250, 6), day('Udaipur', 'Udaipur lakes', 10, 0.5), day('Udaipur', 'Jaipur', 395, 7)
        ]
      },
      spots: [
        { name: 'Highway dhabas, Kishangarh', type: 'dhaba', lat: 26.5900, lng: 74.8600 },
        { name: 'Haveli guesthouses with parking, Jaisalmer', type: 'homestay', lat: 26.9157, lng: 70.9083 },
        { name: 'Water & waste point, Jodhpur', type: 'water', lat: 26.2389, lng: 73.0243 }
      ]
    },
    coorg: {
      practical: {
        altitude: 'Madikeri about 1,100 m; Mullayanagiri about 1,900 m.',
        permits: [{ name: 'No permits needed', link: 'https://karnatakatourism.org/', source: 'Karnataka Tourism' }],
        fuel: 'Pumps in Madikeri, Kushalnagar and Chikmagalur.',
        network: 'Good in towns; patchy on estates.',
        roads: 'Narrow estate roads; the road up to Mullayanagiri is too tight for big vans at the top. Heavy monsoon June–September.'
      },
      plans: {
        'Bengaluru → Coorg → Chikmagalur': [
          day('Bengaluru', 'Madikeri', 265, 6, { note: 'Stop at the Bylakuppe monasteries.' }), day('Madikeri', 'Abbey Falls & Raja’s Seat', 30, 1.5),
          day('Madikeri', 'Chikmagalur', 180, 5), day('Chikmagalur', 'Mullayanagiri', 60, 3, { note: 'Park big vans lower down.' }), day('Chikmagalur', 'Bengaluru', 245, 5.5)
        ]
      },
      spots: [
        { name: 'Highway dhabas, Kushalnagar', type: 'dhaba', lat: 12.4580, lng: 75.9580 },
        { name: 'Coffee estate homestays, Madikeri', type: 'homestay', lat: 12.4244, lng: 75.7382 },
        { name: 'Water point, Chikmagalur', type: 'water', lat: 13.3161, lng: 75.7720 }
      ]
    },
    meghalaya: {
      practical: {
        altitude: 'Shillong about 1,500 m.',
        permits: [{ name: 'No permit needed for Indian tourists', need: 'Carry ID.', link: 'https://www.meghalayatourism.in/', source: 'Meghalaya Tourism' }],
        fuel: 'Fill up in Shillong and Sohra; fewer pumps near Dawki.',
        network: 'Patchy outside towns.',
        roads: 'Winding and often wet; landslides in the monsoon (June–September). Drive slowly in fog.'
      },
      plans: {
        'Shillong → Cherrapunji → Dawki': [
          day('Guwahati', 'Shillong', 100, 3, { alt: 1500 }), day('Shillong', 'Sohra (Cherrapunji)', 55, 2), day('Sohra', 'Nongriat root bridges', 10, 1, { note: 'Steep steps down to the double-decker bridge.' }),
          day('Sohra', 'Dawki via Mawlynnong', 95, 3.5), day('Dawki', 'Shillong', 85, 3)
        ]
      },
      spots: [
        { name: 'Dhaba stop, Nongpoh', type: 'dhaba', lat: 25.9000, lng: 91.8800 },
        { name: 'Homestays with parking, Sohra', type: 'homestay', lat: 25.2702, lng: 91.7323 },
        { name: 'Water & waste point, Shillong', type: 'water', lat: 25.5788, lng: 91.8933 }
      ]
    }
  };
  App.SPOT_TYPES = { campsite: ['Campsites', 'tent'], dhaba: ['Dhabas with parking', 'cooking-pot'], homestay: ['Van-friendly homestays', 'house'], water: ['Water & waste points', 'droplets'] };
})();
