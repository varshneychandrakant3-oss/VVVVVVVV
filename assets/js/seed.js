/*
 * Demo data. Dates are generated relative to "today" so the demo always has
 * upcoming trips, past trips and documents close to expiry.
 */
window.App = window.App || {};

App.buildSeed = function () {
  const day = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = (offset) => App.iso(new Date(today.getTime() + offset * day));
  const ts = (offset, h = 10) => { const t = new Date(today.getTime() + offset * day); t.setHours(h); return t.toISOString(); };

  // Deterministic pseudo-random numbers so the demo looks the same every reset
  let seed = 20260925;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const destinations = [
    {
      id: 'ladakh', name: 'Ladakh', region: 'Ladakh (UT)', lat: 34.1526, lng: 77.5771,
      tagline: 'High passes, turquoise lakes and monasteries on the roof of the world',
      hero: 'photo-1635255506105-b74adbd94026', gallery: ['photo-1619837374214-f5b9eb80876d', 'photo-1600356033695-a003690a6351', 'photo-1641319626759-cc9ea5b18107'],
      bestTime: 'June – September', bestMonths: [6, 7, 8, 9], familyScore: 3,
      familyNotes: 'Stunning but high altitude (3,500 m+). Plan 2 acclimatisation days in Leh; best for kids 8+.',
      highlights: ['Pangong Tso at sunrise', 'Khardung La, one of the highest motorable passes', 'Star-gazing in Hanle dark-sky reserve', 'Nubra Valley sand dunes and Bactrian camels'],
      attractions: ['Thiksey Monastery', 'Magnetic Hill', 'Sangam (Indus–Zanskar confluence)', 'Shanti Stupa', 'Hemis National Park'],
      activities: ['Scenic drives', 'Monastery visits', 'River rafting on the Zanskar', 'Photography', 'Camel safari'],
      routes: [
        { name: 'Manali → Leh Highway', days: 5, km: 480, desc: 'Classic high-altitude drive over Rohtang, Baralacha La and Tanglang La with camps at Jispa and Sarchu.' },
        { name: 'Leh → Nubra → Pangong loop', days: 4, km: 460, desc: 'Cross Khardung La to Hunder dunes, then the Shyok river road to Pangong Tso.' }
      ],
      campsites: [
        { name: 'Pangong Lakeside Camp', type: 'Van-friendly campsite', lat: 33.9175, lng: 78.4541, facilities: ['Toilets', 'Water refill', 'Meals'] },
        { name: 'Hunder Dunes Camp', type: 'Campsite', lat: 34.5794, lng: 77.4722, facilities: ['Toilets', 'Power hook-up'] },
        { name: 'Jispa Riverside', type: 'Campsite', lat: 32.6406, lng: 77.1797, facilities: ['Toilets', 'Showers', 'Water refill'] }
      ]
    },
    {
      id: 'spiti', name: 'Spiti Valley', region: 'Himachal Pradesh', lat: 32.2461, lng: 78.0349,
      tagline: 'A cold desert of cliff-top monasteries and fossil villages',
      hero: 'photo-1653844573020-71f77a0ccb8c', gallery: ['photo-1746093846930-ab89242b9fb9', 'photo-1628782379401-4fff9cdcbbfe', 'photo-1637314995939-7560a94b1495'],
      bestTime: 'May – October', bestMonths: [5, 6, 7, 8, 9, 10], familyScore: 3,
      familyNotes: 'Remote with long driving days and limited medical facilities. Great for adventurous families with older kids.',
      highlights: ['Key Monastery perched on a hill', 'Chandratal “Moon Lake”', 'Fossil hunting in Langza', 'World’s highest post office at Hikkim'],
      attractions: ['Key Monastery', 'Dhankar Fort', 'Chandratal Lake', 'Tabo Monastery (996 AD)', 'Pin Valley National Park'],
      activities: ['Village homestays', 'Star-gazing', 'Fossil walks', 'Snow leopard spotting (winter)'],
      routes: [
        { name: 'Shimla → Kinnaur → Kaza', days: 6, km: 420, desc: 'Gentle acclimatisation through apple orchards of Kinnaur, Nako lake and Tabo.' },
        { name: 'Kaza → Chandratal → Manali', days: 3, km: 200, desc: 'Rough but spectacular road over Kunzum La to the Moon Lake.' }
      ],
      campsites: [
        { name: 'Chandratal Base Camp', type: 'Campsite', lat: 32.4757, lng: 77.6168, facilities: ['Toilets'] },
        { name: 'Kaza Van Park', type: 'Van-friendly campsite', lat: 32.2270, lng: 78.0716, facilities: ['Toilets', 'Showers', 'Power hook-up', 'Water refill'] }
      ]
    },
    {
      id: 'goa', name: 'Goa', region: 'Goa', lat: 15.2993, lng: 74.1240,
      tagline: 'Palm-fringed beaches, Portuguese lanes and sunset shacks',
      hero: 'photo-1614082242765-7c98ca0f3df3', gallery: ['photo-1646748019039-e908f7e41282', 'photo-1652820330085-82a0c2b88d78', 'photo-1727499031382-407906c7e208'],
      bestTime: 'November – March', bestMonths: [11, 12, 1, 2, 3], familyScore: 5,
      familyNotes: 'Short drives, calm beaches in the south and plenty of family-friendly campsites.',
      highlights: ['Quiet southern beaches like Agonda and Palolem', 'Old Goa churches (UNESCO)', 'Dudhsagar waterfalls', 'Fontainhas Latin quarter'],
      attractions: ['Basilica of Bom Jesus', 'Chapora Fort', 'Butterfly Beach', 'Anjuna flea market', 'Cotigao Wildlife Sanctuary'],
      activities: ['Beach camping', 'Kayaking', 'Dolphin spotting', 'Spice plantation tours', 'Night markets'],
      routes: [
        { name: 'North to South coastal crawl', days: 5, km: 140, desc: 'Arambol → Anjuna → Panjim → Colva → Agonda → Palolem, one beach at a time.' },
        { name: 'Goa hinterland & waterfalls', days: 3, km: 180, desc: 'Spice farms of Ponda, Dudhsagar falls and Netravali forest.' }
      ],
      campsites: [
        { name: 'Agonda Beach Van Stop', type: 'Van-friendly campsite', lat: 15.0444, lng: 73.9868, facilities: ['Toilets', 'Showers', 'Water refill', 'Power hook-up'] },
        { name: 'Arambol Cliff Camp', type: 'Campsite', lat: 15.6868, lng: 73.7036, facilities: ['Toilets', 'Cafe'] },
        { name: 'Netravali Forest Camp', type: 'Eco campsite', lat: 15.0869, lng: 74.2166, facilities: ['Toilets', 'Guided walks'] }
      ]
    },
    {
      id: 'kerala', name: 'Kerala', region: 'Kerala', lat: 9.9312, lng: 76.2673,
      tagline: 'Backwaters, tea hills and misty spice country',
      hero: 'photo-1602216056096-3b40cc0c9944', gallery: ['photo-1627370778723-4d26700cd972', 'photo-1704365159747-1f7b8913044f', 'photo-1624554305378-0f440dd3a8c1'],
      bestTime: 'September – March', bestMonths: [9, 10, 11, 12, 1, 2, 3], familyScore: 5,
      familyNotes: 'Easy roads, lots of nature and wildlife. Monsoon (June–Aug) is lush but wet.',
      highlights: ['Alleppey backwater houseboat day', 'Munnar tea estates', 'Wildlife at Periyar', 'Varkala cliffs and beach'],
      attractions: ['Fort Kochi', 'Eravikulam National Park', 'Kumarakom Bird Sanctuary', 'Athirappilly Falls', 'Jatayu Earth’s Center'],
      activities: ['Houseboat cruise', 'Tea factory tours', 'Ayurveda', 'Kathakali performance', 'Elephant-free wildlife safaris'],
      routes: [
        { name: 'Kochi → Munnar → Thekkady → Alleppey', days: 7, km: 450, desc: 'The classic loop: colonial Kochi, tea hills, spice forests and backwaters.' },
        { name: 'Coastal Kerala: Kochi → Varkala', days: 4, km: 180, desc: 'Beaches, lighthouses and cliff-top cafés.' }
      ],
      campsites: [
        { name: 'Munnar Tea Valley Camp', type: 'Van-friendly campsite', lat: 10.0889, lng: 77.0595, facilities: ['Toilets', 'Showers', 'Power hook-up'] },
        { name: 'Alleppey Lakeside', type: 'Campsite', lat: 9.4981, lng: 76.3388, facilities: ['Toilets', 'Water refill'] }
      ]
    },
    {
      id: 'rajasthan', name: 'Rajasthan', region: 'Rajasthan', lat: 26.9124, lng: 75.7873,
      tagline: 'Forts, palaces and golden desert nights',
      hero: 'photo-1477587458883-47145ed94245', gallery: ['photo-1599661046289-e31897846e41', 'photo-1615836245337-f5b9b2303f10', 'photo-1638904998527-a451c1fbd1cb'],
      bestTime: 'October – March', bestMonths: [10, 11, 12, 1, 2, 3], familyScore: 5,
      familyNotes: 'Wide highways, forts kids love and desert camps with folk music. Avoid April–June heat.',
      highlights: ['Amber Fort in Jaipur', 'Sam sand dunes near Jaisalmer', 'Lake palaces of Udaipur', 'Blue city of Jodhpur'],
      attractions: ['Hawa Mahal', 'Mehrangarh Fort', 'City Palace Udaipur', 'Jaisalmer Fort', 'Ranthambore National Park'],
      activities: ['Desert camping', 'Tiger safari', 'Heritage walks', 'Camel rides', 'Bazaar shopping'],
      routes: [
        { name: 'Royal Rajasthan loop', days: 10, km: 1400, desc: 'Jaipur → Jodhpur → Jaisalmer → Udaipur → back to Jaipur via Pushkar.' },
        { name: 'Jaipur & Ranthambore weekend', days: 3, km: 360, desc: 'Palaces, then two tiger safaris.' }
      ],
      campsites: [
        { name: 'Sam Dunes Desert Camp', type: 'Van-friendly campsite', lat: 26.8260, lng: 70.5030, facilities: ['Toilets', 'Showers', 'Meals', 'Folk music'] },
        { name: 'Pushkar Lake Camp', type: 'Campsite', lat: 26.4897, lng: 74.5511, facilities: ['Toilets', 'Water refill'] }
      ]
    },
    {
      id: 'himachal', name: 'Manali & Kullu', region: 'Himachal Pradesh', lat: 32.2432, lng: 77.1892,
      tagline: 'Pine forests, rivers and snowy passes within easy reach',
      hero: 'photo-1597167231350-d057a45dc868', gallery: ['photo-1607836046730-3317bd58a31b', 'photo-1652501834567-937de29c4533', 'photo-1620720970374-5b7e67e1e610'],
      bestTime: 'March – June, October', bestMonths: [3, 4, 5, 6, 10], familyScore: 4,
      familyNotes: 'Good mix of easy nature walks and adventure. Mountain roads — drive in daylight.',
      highlights: ['Solang Valley adventure sports', 'Old Manali cafés', 'Hot springs of Manikaran', 'Atal Tunnel to Lahaul'],
      attractions: ['Hadimba Temple', 'Jogini Falls', 'Great Himalayan National Park', 'Naggar Castle', 'Kasol & Parvati Valley'],
      activities: ['Paragliding', 'River rafting', 'Trekking', 'Apple orchard stays'],
      routes: [
        { name: 'Kullu–Manali valley drive', days: 4, km: 160, desc: 'Kullu → Naggar → Manali → Solang → Sissu through the Atal Tunnel.' },
        { name: 'Parvati Valley escape', days: 3, km: 120, desc: 'Bhuntar → Kasol → Manikaran with riverside camps.' }
      ],
      campsites: [
        { name: 'Solang Meadows Camp', type: 'Van-friendly campsite', lat: 32.3166, lng: 77.1570, facilities: ['Toilets', 'Showers', 'Power hook-up'] },
        { name: 'Kasol Riverside', type: 'Campsite', lat: 32.0100, lng: 77.3150, facilities: ['Toilets', 'Cafe'] }
      ]
    },
    {
      id: 'rishikesh', name: 'Rishikesh & Garhwal', region: 'Uttarakhand', lat: 30.0869, lng: 78.2676,
      tagline: 'Ganga river camps, yoga and Himalayan foothills',
      hero: 'photo-1712510817140-917938f92e5b', gallery: ['photo-1603867106100-0d2039fc8757', 'photo-1720819029162-8500607ae232', 'photo-1718383537411-6f9e727ae0bb'],
      bestTime: 'September – November, February – May', bestMonths: [2, 3, 4, 5, 9, 10, 11], familyScore: 4,
      familyNotes: 'Riverside beaches and gentle rafting for kids 12+. Short drive from Delhi.',
      highlights: ['Ganga Aarti at Triveni Ghat', 'White-water rafting', 'Chopta meadows and Tungnath', 'Rajaji National Park'],
      attractions: ['Laxman Jhula', 'Beatles Ashram', 'Neer Garh waterfall', 'Deoria Tal', 'Kunjapuri sunrise'],
      activities: ['Rafting', 'Yoga retreats', 'Riverside camping', 'Bird watching'],
      routes: [
        { name: 'Delhi → Rishikesh → Chopta', days: 5, km: 520, desc: 'River camps, then up into rhododendron forests for the Tungnath trek.' },
        { name: 'Rishikesh weekend', days: 2, km: 60, desc: 'Rafting at Shivpuri and a night on a river beach.' }
      ],
      campsites: [
        { name: 'Shivpuri River Beach Camp', type: 'Van-friendly campsite', lat: 30.1400, lng: 78.3908, facilities: ['Toilets', 'Showers', 'Meals'] },
        { name: 'Chopta Meadow Camp', type: 'Campsite', lat: 30.4856, lng: 79.2129, facilities: ['Toilets'] }
      ]
    },
    {
      id: 'coorg', name: 'Coorg & Chikmagalur', region: 'Karnataka', lat: 12.3375, lng: 75.8069,
      tagline: 'Coffee estates, waterfalls and rainforest roads',
      hero: 'photo-1529057299613-a565b7ce93aa', gallery: ['photo-1569996980833-901b5cd2eb70', 'photo-1634874634941-78abc0a00298', 'photo-1710612198146-77512950a4b7'],
      bestTime: 'October – April', bestMonths: [10, 11, 12, 1, 2, 3, 4], familyScore: 5,
      familyNotes: 'Easy weekend from Bengaluru, cool weather and plantation stays kids enjoy.',
      highlights: ['Coffee plantation walks', 'Abbey Falls', 'Dubare elephant camp (observation only)', 'Mullayanagiri peak'],
      attractions: ['Raja’s Seat', 'Namdroling Monastery', 'Iruppu Falls', 'Nagarhole National Park', 'Baba Budangiri'],
      activities: ['Coffee tasting', 'River rafting at Barapole', 'Birding', 'Plantation stays'],
      routes: [
        { name: 'Bengaluru → Coorg → Chikmagalur', days: 5, km: 620, desc: 'Coffee country loop with waterfalls and a monastery stop at Bylakuppe.' }
      ],
      campsites: [
        { name: 'Coffee Estate Van Retreat', type: 'Van-friendly campsite', lat: 12.4244, lng: 75.7382, facilities: ['Toilets', 'Showers', 'Power hook-up', 'Water refill'] },
        { name: 'Bhadra Riverside', type: 'Eco campsite', lat: 13.6980, lng: 75.6400, facilities: ['Toilets', 'Guided safari'] }
      ]
    },
    {
      id: 'meghalaya', name: 'Meghalaya', region: 'Meghalaya', lat: 25.5788, lng: 91.8933,
      tagline: 'Living root bridges, crystal rivers and the cloud kingdom',
      hero: 'photo-1609276804051-8c5e906cc430', gallery: ['photo-1593813738953-fb3c93e0769d', 'photo-1552978534-9d01e1f91517', 'photo-1686472886489-1d2d7e08ff9c'],
      bestTime: 'October – April', bestMonths: [10, 11, 12, 1, 2, 3, 4], familyScore: 4,
      familyNotes: 'Short drives between sights; some root-bridge treks have 3,000+ steps.',
      highlights: ['Double-decker living root bridge', 'Glass-clear Umngot river at Dawki', 'Mawlynnong, “cleanest village in Asia”', 'Nohkalikai Falls'],
      attractions: ['Cherrapunji', 'Laitlum Canyons', 'Mawsmai Cave', 'Shillong Peak', 'Krang Suri Falls'],
      activities: ['Caving', 'Boating at Dawki', 'Waterfall hikes', 'Village stays'],
      routes: [
        { name: 'Shillong → Cherrapunji → Dawki', days: 5, km: 260, desc: 'Canyons, waterfalls, root bridges and the clearest river in India.' }
      ],
      campsites: [
        { name: 'Shnongpdeng Riverside', type: 'Campsite', lat: 25.2090, lng: 92.0090, facilities: ['Toilets', 'Boating'] },
        { name: 'Sohra Plateau Van Stop', type: 'Van-friendly campsite', lat: 25.2702, lng: 91.7323, facilities: ['Toilets', 'Water refill'] }
      ]
    }
  ];

  const users = [
    { id: 'u_admin', name: 'Aisha Kapoor', email: 'admin@vanyatra.in', phone: '+91 98200 00001', role: 'admin' },
    { id: 'u_owner1', name: 'Rohan Mehta', email: 'owner@vanyatra.in', phone: '+91 98200 10001', role: 'owner', city: 'Manali', business: 'Mehta Mountain Vans' },
    { id: 'u_owner2', name: 'Meera Nair', email: 'meera@vanyatra.in', phone: '+91 98200 10002', role: 'owner', city: 'Kochi', business: 'Coastline Campers' },
    { id: 'u_owner3', name: 'Tenzin Dorje', email: 'tenzin@vanyatra.in', phone: '+91 98200 10003', role: 'owner', city: 'Leh', business: 'Himalayan Overland' },
    { id: 'u_owner4', name: 'Karan Singh', email: 'karan@vanyatra.in', phone: '+91 98200 10004', role: 'owner', city: 'Jaipur', business: 'Desert Rover Co.' },
    { id: 'u_owner5', name: 'Farhan Shaikh', email: 'farhan@vanyatra.in', phone: '+91 98200 10005', role: 'owner', city: 'Margao', business: 'Konkan Camper Co.' },
    { id: 'u_owner6', name: 'Banri Syiem', email: 'banri@vanyatra.in', phone: '+91 98200 10006', role: 'owner', city: 'Shillong', business: 'Khasi Hills Vans' },
    { id: 'u_owner7', name: 'Divya Hegde', email: 'divya@vanyatra.in', phone: '+91 98200 10007', role: 'owner', city: 'Madikeri', business: 'Coorg Roamers' },
    { id: 'u_owner8', name: 'Vikram Rathore', email: 'vikram@vanyatra.in', phone: '+91 98200 10008', role: 'owner', city: 'Jodhpur', business: 'Marwar Motorhomes' },
    { id: 'u_cust1', name: 'Priya Sharma', email: 'traveller@vanyatra.in', phone: '+91 98200 20001', role: 'customer', city: 'Delhi' },
    { id: 'u_cust2', name: 'Arjun Rao', email: 'arjun@example.com', phone: '+91 98200 20002', role: 'customer', city: 'Bengaluru' },
    { id: 'u_cust3', name: 'Neha & Vikram Joshi', email: 'joshis@example.com', phone: '+91 98200 20003', role: 'customer', city: 'Pune' },
    { id: 'u_cust4', name: 'Sam Fernandes', email: 'sam@example.com', phone: '+91 98200 20004', role: 'customer', city: 'Mumbai' },
    { id: 'u_cust5', name: 'Ananya Iyer', email: 'ananya@example.com', phone: '+91 98200 20005', role: 'customer', city: 'Chennai' }
  ].map((u, i) => ({
    password: App.hashPassword('demo1234'),
    emailVerified: true, phoneVerified: true, status: 'active',
    savedVans: [], createdAt: ts(-400 + i * 20), avatarHue: (i * 47) % 360,
    ...u
  }));

  // Owner-level onboarding state
  const ownerDone = (extra = {}) => ({
    account: { status: 'verified' }, kyc: { status: 'verified', data: { aadhaarLast4: '4821', pan: 'ABCPM1234K' } },
    business: { status: 'verified' }, payout: { status: 'verified', data: { bank: 'HDFC Bank', last4: '7712', ifsc: 'HDFC0001234' } }, ...extra
  });
  const owners = {
    u_owner1: ownerDone(), u_owner2: ownerDone(), u_owner3: ownerDone(),
    u_owner5: ownerDone(), u_owner6: ownerDone(), u_owner7: ownerDone(), u_owner8: ownerDone(),
    u_owner4: { account: { status: 'verified' }, kyc: { status: 'pending', data: { aadhaarLast4: '9034', pan: 'BQRPS5521L' } }, business: { status: 'verified' }, payout: { status: 'pending', data: { bank: 'State Bank of India', last4: '0452', ifsc: 'SBIN0004567' } } }
  };

  // Photo pools (Unsplash). Exteriors are matched to the van type; every van gets a
  // unique cover plus a second exterior, two interiors, a kitchen and a campsite shot.
  const PHOTOS = {
    van: [
      'photo-1576793048000-494aaa93d160', 'photo-1584198775168-cd76729ac207', 'photo-1649851706700-56d3751fa9b1', 'photo-1534540378968-85a7b8fde19f',
      'photo-1645099815537-cea03d831528', 'photo-1521014710171-f44dfe788ece', 'photo-1571235663358-c402973503af', 'photo-1515876305430-f06edab8282a',
      'photo-1594495894542-a46cc73e081a', 'photo-1625492995811-646c41068abe', 'photo-1469854523086-cc02fe5d8800', 'photo-1532115298834-4c70d11ec8f3',
      'photo-1634109725557-d2b8ac9f6c5c', 'photo-1626439613007-dffa9b69f7e0', 'photo-1626439613014-b367890c70cb', 'photo-1596470693312-9a3686a0af0f',
      'photo-1655827268198-aee7f7ace729', 'photo-1626327547387-b2663804dd50', 'photo-1628132261841-cf77e5f0e246', 'photo-1627386172764-1d1b7ea90b66',
      'photo-1652093932112-3fbc369da1f3', 'photo-1549194898-60fd030ecc0f', 'photo-1595251823086-930f6265cccc', 'photo-1670326457662-d981e6788945',
      'photo-1764067218398-e568ff9dccaa', 'photo-1781630079309-56fe5a17d369', 'photo-1766083639110-ec7c4ad90490', 'photo-1764565689057-e94475ef873c',
      'photo-1548378043-2b0571e7d0ce', 'photo-1624355761500-f00bb5cfb5a1', 'photo-1593914370442-49d414beca24', 'photo-1536294295328-fddf6da9d47e',
      'photo-1528759335187-3b683174c86a', 'photo-1513350949-6bd4ab6ff7f8', 'photo-1619317190381-643a6b28d6e6', 'photo-1770752575355-a9d90d5644bb',
      'photo-1770752575348-a064d4477761', 'photo-1721931248510-9d3e07c6b522', 'photo-1721220300289-b12765c054b6', 'photo-1564657536900-e6118c5e25f0',
      'photo-1773762159818-d929964ab226', 'photo-1628132260719-00bd4b2902ec'
    ],
    rv: [
      'photo-1626680114529-3f6ffa002b80', 'photo-1629222247198-00b164054719', 'photo-1613142078060-88d5609458c4', 'photo-1591091221408-63351f26777a',
      'photo-1515172128886-07c606bb4eb3', 'photo-1511533910568-be3ffdc229bb', 'photo-1574260031597-bcd9eb192b4f', 'photo-1658257654756-cc6ba6490ea9',
      'photo-1629222247196-d38d47441a1b', 'photo-1597327190279-43b91807c7a5', 'photo-1513311068348-19c8fbdc0bb6', 'photo-1596470689657-bcfc0e24f4e0',
      'photo-1563783850023-077d97825802', 'photo-1523987355523-c7b5b0dd90a7', 'photo-1592351763700-b9b35a6465ea', 'photo-1566847838496-c670dd0ec05e',
      'photo-1599889917438-211ac4924647', 'photo-1527542902003-a675625fb1eb', 'photo-1591447722629-2d3ecd3b2d62', 'photo-1635787501769-10b8e23b3ded'
    ],
    overland: [
      'photo-1663679931361-19938f30c979', 'photo-1782192176298-5fb589feb539', 'photo-1519443933981-c665c4a62ad4', 'photo-1757286916917-ea71f0fc9a4d',
      'photo-1779226347538-ca1a725ae550', 'photo-1636138105085-3e9381a8e438', 'photo-1643716353701-130855d55e35'
    ],
    interior: [
      'photo-1773123441753-e87f821ec76d', 'photo-1785184949143-112301fcd809', 'photo-1557854135-779395816fbe', 'photo-1789043551317-048afedffa8e',
      'photo-1692279952778-00ce5c3ce02c', 'photo-1789043549866-ea7ff893df9f', 'photo-1557855226-e63c7f07d9fb', 'photo-1649284538754-8d69dfa984cc',
      'photo-1683582160988-5809b4886adc', 'photo-1633362501620-447ba5b52a82', 'photo-1783731127141-b159143d5828', 'photo-1557854588-d0a7bb40a50d',
      'photo-1587061118028-b80b3547f924', 'photo-1533176403861-b654cad1ecf1', 'photo-1546556407-5a1b85d0a2cb', 'photo-1694530482596-48425885be98',
      'photo-1496864317203-ec844065153b', 'photo-1587061117940-d7724587dc5a', 'photo-1624903041761-f31cf79f810c'
    ],
    kitchen: [
      'photo-1773762159604-0ec52bcdf918', 'photo-1767052879108-65dee83a5887', 'photo-1773762159808-510a225fcaa1', 'photo-1773762159864-59966f6f82c7',
      'photo-1681400803605-8dc103e102e7', 'photo-1783522277767-b3fbe3296a70'
    ],
    camp: [
      'photo-1477512076069-d31eb021716f', 'photo-1530541930197-ff16ac917b0e', 'photo-1558724065-2f80d1ae6002', 'photo-1596470692500-66cbc5daea08',
      'photo-1748251741266-1c5dfae05b92', 'photo-1590812505525-f3e96521e7ce', 'photo-1782150042524-53c5dd17c204', 'photo-1596470692137-ead1053a1e5c',
      'photo-1618772446265-3f9f8e6f8487'
    ]
  };
  const coverCount = { van: 0, rv: 0, overland: 0 };
  const photosFor = (type, i) => {
    const pool = type === 'Motorhome' || type === 'Caravan' ? 'rv' : type === '4x4 Overlander' ? 'overland' : 'van';
    const list = PHOTOS[pool], n = coverCount[pool]++;
    const at = (arr, k) => arr[k % arr.length];
    const set = [
      at(list, n), at(list, n + Math.ceil(list.length / 2)),
      at(PHOTOS.interior, i * 2), at(PHOTOS.interior, i * 2 + 1),
      at(PHOTOS.kitchen, i), at(PHOTOS.camp, i)
    ];
    return i % 3 === 2 ? set.slice(0, 5) : set; // a mix of 5- and 6-photo listings
  };
  const STATE_CODE = { himachal: 'HP', spiti: 'HP', ladakh: 'LA', goa: 'GA', kerala: 'KL', rajasthan: 'RJ', rishikesh: 'UK', coorg: 'KA', meghalaya: 'ML' };

  const vanDefs = [
    ['v1', 'u_owner1', 'Himalayan Explorer', 'Campervan', 'himachal', 'Manali', 32.2396, 77.1887, 6500, 4, 4, 'Force', 'Traveller 3350', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'awning', 'gps', 'campingchairs', 'watertank'], true, false, 'moderate', true],
    ['v2', 'u_owner1', 'Snowline Pop-top', 'Pop-top', 'himachal', 'Kullu', 31.9579, 77.1095, 4800, 3, 4, 'Mahindra', 'Bolero Camper', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'gps', 'campingchairs', 'watertank'], true, true, 'flexible', true],
    ['v3', 'u_owner1', 'Spiti Trail 4x4', '4x4 Overlander', 'spiti', 'Kaza', 32.2270, 78.0716, 8900, 2, 4, 'Toyota', 'Hilux Overland', 2024, 'Diesel', 'Automatic', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'awning', 'gps', 'watertank'], false, false, 'strict', false],
    ['v4', 'u_owner1', 'Rishikesh River Runner', 'Campervan', 'rishikesh', 'Rishikesh', 30.1086, 78.2932, 5200, 4, 5, 'Force', 'Urbania Camper', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'inverter', 'bikerack', 'childseat', 'gps', 'campingchairs', 'watertank'], true, true, 'flexible', true],
    ['v5', 'u_owner2', 'Backwater Breeze', 'Motorhome', 'kerala', 'Kochi', 9.9658, 76.2421, 9800, 6, 6, 'Tata', 'Winger Motorhome', 2024, 'Diesel', 'Manual', ['kitchen', 'fridge', 'shower', 'toilet', 'ac', 'inverter', 'wifi', 'awning', 'childseat', 'gps', 'campingchairs', 'watertank'], true, false, 'moderate', true],
    ['v6', 'u_owner2', 'Coastline Cruiser', 'Campervan', 'goa', 'Panjim', 15.4909, 73.8278, 5900, 4, 4, 'Force', 'Traveller Camper', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'inverter', 'awning', 'bikerack', 'pets', 'gps', 'campingchairs'], true, true, 'flexible', true],
    ['v7', 'u_owner2', 'Tea Hills Tiny Van', 'Pop-top', 'kerala', 'Munnar', 10.0889, 77.0595, 3900, 2, 2, 'Maruti', 'Eeco Micro Camper', 2021, 'Petrol', 'Manual', ['kitchen', 'fridge', 'gps', 'campingchairs'], false, true, 'flexible', true],
    ['v8', 'u_owner3', 'Pangong Nomad', '4x4 Overlander', 'ladakh', 'Leh', 34.1642, 77.5848, 11500, 3, 4, 'Isuzu', 'D-Max Overland', 2024, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'awning', 'gps', 'watertank'], false, false, 'strict', false],
    ['v9', 'u_owner3', 'Leh Family Motorhome', 'Motorhome', 'ladakh', 'Leh', 34.1526, 77.5771, 13900, 6, 6, 'Force', 'Traveller Motorhome', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'shower', 'toilet', 'heater', 'solar', 'inverter', 'childseat', 'gps', 'watertank', 'campingchairs'], true, false, 'moderate', true],
    ['v10', 'u_owner1', 'Coffee Country Camper', 'Campervan', 'coorg', 'Madikeri', 12.4244, 75.7382, 5400, 4, 4, 'Force', 'Traveller Camper', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'inverter', 'awning', 'childseat', 'gps', 'campingchairs', 'watertank'], true, true, 'moderate', true],
    ['v11', 'u_owner2', 'Cloud Kingdom Van', 'Campervan', 'meghalaya', 'Shillong', 25.5788, 91.8933, 6100, 4, 4, 'Mahindra', 'Scorpio Camper', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'inverter', 'gps', 'campingchairs'], true, false, 'moderate', true],
    ['v12', 'u_owner4', 'Desert Rover Caravan', 'Caravan', 'rajasthan', 'Jaipur', 26.9124, 75.7873, 7200, 5, 5, 'Tata', 'Winger Caravan', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'toilet', 'ac', 'inverter', 'awning', 'childseat', 'gps', 'campingchairs', 'watertank'], true, false, 'moderate', true],
    // Manali & Kullu
    ['v13', 'u_owner1', 'Parvati Valley Pop-top', 'Pop-top', 'himachal', 'Kasol', 32.0100, 77.3150, 4600, 3, 4, 'Mahindra', 'Bolero Pop-top', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'gps', 'campingchairs', 'watertank'], false, true, 'flexible', true],
    ['v14', 'u_owner1', 'Solang Family Motorhome', 'Motorhome', 'himachal', 'Manali', 32.2600, 77.1800, 11800, 6, 6, 'Force', 'Traveller Motorhome', 2024, 'Diesel', 'Manual', ['kitchen', 'fridge', 'shower', 'toilet', 'heater', 'solar', 'inverter', 'childseat', 'gps', 'watertank', 'campingchairs'], true, false, 'moderate', true],
    // Spiti Valley
    ['v15', 'u_owner3', 'Kaza Cold Desert Cruiser', '4x4 Overlander', 'spiti', 'Kaza', 32.2250, 78.0700, 9800, 2, 4, 'Toyota', 'Hilux Overland', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'awning', 'gps', 'watertank'], false, false, 'strict', true],
    ['v16', 'u_owner1', 'Chandratal Camper', 'Campervan', 'spiti', 'Kaza', 32.2300, 78.0650, 7400, 4, 4, 'Force', 'Traveller 3350', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'gps', 'campingchairs', 'watertank'], true, true, 'moderate', true],
    ['v17', 'u_owner3', 'Key Monastery Motorhome', 'Motorhome', 'spiti', 'Tabo', 32.0930, 78.3830, 12600, 5, 5, 'Tata', 'Winger Motorhome', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'toilet', 'heater', 'solar', 'inverter', 'childseat', 'gps', 'watertank'], true, false, 'moderate', true],
    // Rishikesh & Garhwal
    ['v18', 'u_owner1', 'Ganga Riverside Van', 'Campervan', 'rishikesh', 'Rishikesh', 30.1200, 78.3100, 4900, 2, 2, 'Maruti', 'Eeco Camper', 2022, 'Petrol', 'Manual', ['kitchen', 'fridge', 'inverter', 'gps', 'campingchairs'], false, true, 'flexible', true],
    ['v19', 'u_owner1', 'Chopta Trail Pop-top', 'Pop-top', 'rishikesh', 'Rishikesh', 30.0900, 78.2700, 5600, 3, 4, 'Mahindra', 'Scorpio Pop-top', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'awning', 'bikerack', 'gps', 'campingchairs'], true, true, 'moderate', true],
    ['v20', 'u_owner1', 'Doon Valley Motorhome', 'Motorhome', 'rishikesh', 'Dehradun', 30.3165, 78.0322, 10400, 6, 6, 'Force', 'Urbania Motorhome', 2024, 'Diesel', 'Automatic', ['kitchen', 'fridge', 'shower', 'toilet', 'ac', 'inverter', 'wifi', 'childseat', 'gps', 'watertank'], true, false, 'moderate', true],
    // Kerala
    ['v21', 'u_owner2', 'Varkala Cliff Camper', 'Campervan', 'kerala', 'Varkala', 8.7379, 76.7163, 5800, 4, 4, 'Force', 'Traveller Camper', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'inverter', 'awning', 'gps', 'campingchairs', 'pets'], true, true, 'flexible', true],
    ['v22', 'u_owner2', 'Periyar Spice Trail', 'Pop-top', 'kerala', 'Kumily', 9.6069, 77.1614, 4700, 3, 4, 'Mahindra', 'Bolero Pop-top', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'gps', 'campingchairs', 'watertank'], true, true, 'moderate', true],
    // Goa
    ['v23', 'u_owner5', 'Palolem Surf Van', 'Campervan', 'goa', 'Canacona', 15.0100, 74.0232, 5200, 2, 2, 'Force', 'Traveller Camper', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'bikerack', 'awning', 'gps', 'campingchairs'], false, true, 'flexible', true],
    ['v24', 'u_owner5', 'Konkan Family Caravan', 'Caravan', 'goa', 'Margao', 15.2832, 73.9862, 8400, 5, 5, 'Tata', 'Winger Caravan', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'toilet', 'ac', 'inverter', 'awning', 'childseat', 'gps', 'campingchairs', 'watertank'], true, false, 'moderate', true],
    ['v25', 'u_owner5', 'Anjuna Sunset Pop-top', 'Pop-top', 'goa', 'Mapusa', 15.5937, 73.8142, 4400, 3, 4, 'Mahindra', 'Bolero Pop-top', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'gps', 'campingchairs', 'pets'], true, true, 'flexible', true],
    // Ladakh
    ['v26', 'u_owner3', 'Nubra Dunes Overlander', '4x4 Overlander', 'ladakh', 'Leh', 34.1700, 77.5900, 12200, 2, 4, 'Isuzu', 'D-Max V-Cross Overland', 2024, 'Diesel', 'Automatic', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'awning', 'gps', 'watertank'], false, false, 'strict', true],
    ['v27', 'u_owner3', 'Khardung La Camper', 'Campervan', 'ladakh', 'Leh', 34.1600, 77.5700, 9200, 4, 4, 'Force', 'Traveller 3350', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'gps', 'campingchairs', 'watertank', 'childseat'], true, true, 'moderate', true],
    // Coorg & Chikmagalur
    ['v28', 'u_owner7', 'Abbey Falls Camper', 'Campervan', 'coorg', 'Madikeri', 12.4200, 75.7400, 5100, 4, 4, 'Force', 'Traveller Camper', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'inverter', 'awning', 'childseat', 'gps', 'campingchairs'], true, true, 'moderate', true],
    ['v29', 'u_owner7', 'Chikmagalur Coffee Van', 'Pop-top', 'coorg', 'Chikmagalur', 13.3161, 75.7720, 4500, 3, 4, 'Mahindra', 'Bolero Pop-top', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'gps', 'campingchairs', 'pets'], true, true, 'flexible', true],
    ['v30', 'u_owner7', 'Kabini Wild Motorhome', 'Motorhome', 'coorg', 'Mysuru', 12.2958, 76.6394, 9900, 6, 6, 'Tata', 'Winger Motorhome', 2024, 'Diesel', 'Manual', ['kitchen', 'fridge', 'shower', 'toilet', 'ac', 'inverter', 'childseat', 'gps', 'watertank'], true, false, 'moderate', true],
    // Meghalaya
    ['v31', 'u_owner6', 'Sohra Rain Camper', 'Campervan', 'meghalaya', 'Shillong', 25.5700, 91.8800, 5900, 4, 4, 'Force', 'Traveller Camper', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'inverter', 'awning', 'gps', 'campingchairs'], true, true, 'moderate', true],
    ['v32', 'u_owner6', 'Dawki River Pop-top', 'Pop-top', 'meghalaya', 'Shillong', 25.5800, 91.9000, 4800, 3, 4, 'Mahindra', 'Scorpio Pop-top', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'gps', 'campingchairs', 'watertank'], false, true, 'flexible', true],
    ['v33', 'u_owner6', 'Living Root Bridge 4x4', '4x4 Overlander', 'meghalaya', 'Shillong', 25.5650, 91.8700, 8600, 2, 4, 'Toyota', 'Hilux Overland', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'heater', 'solar', 'inverter', 'awning', 'gps', 'watertank'], false, false, 'strict', true],
    // Rajasthan
    ['v34', 'u_owner8', 'Thar Desert Motorhome', 'Motorhome', 'rajasthan', 'Jaisalmer', 26.9157, 70.9083, 11200, 6, 6, 'Force', 'Traveller Motorhome', 2024, 'Diesel', 'Manual', ['kitchen', 'fridge', 'shower', 'toilet', 'ac', 'inverter', 'childseat', 'gps', 'watertank', 'campingchairs'], true, false, 'moderate', true],
    ['v35', 'u_owner8', 'Blue City Campervan', 'Campervan', 'rajasthan', 'Jodhpur', 26.2389, 73.0243, 5700, 4, 4, 'Force', 'Traveller Camper', 2023, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'inverter', 'awning', 'gps', 'campingchairs'], true, true, 'moderate', true],
    ['v36', 'u_owner8', 'Lake City Pop-top', 'Pop-top', 'rajasthan', 'Udaipur', 24.5854, 73.7125, 4600, 3, 4, 'Mahindra', 'Bolero Pop-top', 2022, 'Diesel', 'Manual', ['kitchen', 'fridge', 'ac', 'gps', 'campingchairs', 'pets'], true, true, 'flexible', true]
  ];

  const descs = {
    Campervan: 'A cosy, easy-to-drive campervan with a proper bed, kitchenette and everything you need for a slow road trip. Handover includes a full walkthrough, route tips and a stocked camping kit.',
    Motorhome: 'A spacious motorhome with separate sleeping areas, a bathroom and a full galley — ideal for families who want hotel comfort with road-trip freedom.',
    'Pop-top': 'Compact and nimble with a pop-up roof that creates standing room and an extra bed. Parks anywhere, sips fuel and fits narrow village roads.',
    '4x4 Overlander': 'Built for rough mountain roads with all-terrain tyres, rooftop tent, recovery gear and dual batteries. For experienced drivers heading off the beaten path.',
    Caravan: 'A comfortable caravan with a lounge, full kitchen and plenty of storage — great for relaxed multi-stop trips.'
  };
  const sleepText = { 2: '1 double bed', 3: '1 double + 1 single', 4: '1 double + 2 bunks', 5: '1 double + 1 convertible dinette + 1 bunk', 6: '1 queen + 1 double + convertible dinette' };

  const vans = vanDefs.map((v, i) => {
    const [id, ownerId, name, type, destinationId, city, lat, lng, price, sleeps, seats, make, model, year, fuel, transmission, amenities, familyFriendly, instantBook, cancellation, published] = v;
    const photos = photosFor(type, i);
    return {
      id, ownerId, name, type, destinationId, city, sleeps, seats, make, model, year, fuel, transmission, amenities,
      familyFriendly, petFriendly: amenities.includes('pets'), instantBook, cancellation,
      pricePerNight: price, weekendPrice: Math.round(price * 1.15 / 100) * 100, cleaningFee: type === 'Motorhome' ? 2000 : 1200,
      deposit: price >= 9000 ? 25000 : 15000, minNights: type === '4x4 Overlander' ? 3 : 2,
      discounts: { weekly: 10, monthly: 20 }, kmPerDay: 250, extraKmFee: 12,
      beds: sleepText[sleeps], length: type === 'Motorhome' ? '7.2 m' : type === 'Pop-top' ? '4.5 m' : '5.9 m',
      licence: type === 'Motorhome' ? 'LMV (Transport) licence' : 'Standard LMV car licence',
      mileage: fuel === 'Diesel' ? '11 km/l' : '15 km/l',
      pickup: { city, address: `${name.split(' ')[0]} Van Base, ${city}`, lat, lng, time: '11:00', returnTime: '10:00' },
      rules: ['No smoking inside the van', amenities.includes('pets') ? 'Pets welcome (max 2), cleaning fee applies' : 'No pets', 'Minimum driver age ' + App.C.minDriverAge + ' with 2+ years of licence', 'Return with the same fuel level', 'No off-road driving unless 4x4', 'Quiet hours at campsites 10 pm – 7 am'],
      description: descs[type],
      photos,
      blocked: [{ start: d(35 + i * 9), end: d(37 + i * 9), note: 'Service' }],
      status: published ? 'published' : 'in_review',
      verification: published
        ? { ownership: 'verified', registration: 'verified', insurance: 'verified', inspection: 'verified', photos: 'verified', listing: 'verified', review: 'verified' }
        : { ownership: 'verified', registration: 'pending', insurance: 'pending', inspection: 'pending', photos: 'verified', listing: 'verified', review: 'pending' },
      views: 300 + Math.floor(rnd() * 2400),
      createdAt: ts(-300 + i * 10)
    };
  });
  // Karan's van is published but his own KYC is still pending: make the van pending too
  vans.find(v => v.id === 'v12').status = 'in_review';
  vans.find(v => v.id === 'v12').verification = { ownership: 'pending', registration: 'pending', insurance: 'pending', inspection: 'not_started', photos: 'verified', listing: 'verified', review: 'not_started' };

  // Documents with expiry dates
  const documents = [];
  let docN = 1;
  const addDoc = (o) => documents.push({ id: 'doc' + (docN++), submittedAt: ts(-200), fileName: o.type + '.pdf', note: '', ...o });
  for (const v of vans) {
    const pub = v.status === 'published';
    const st = pub ? 'verified' : 'pending';
    addDoc({ ownerId: v.ownerId, vanId: v.id, type: 'rc', label: 'Registration Certificate (RC)', number: `${STATE_CODE[v.destinationId] || 'HP'}-01-AB-${1000 + vans.indexOf(v)}`, expiry: d(2400), status: st });
    addDoc({ ownerId: v.ownerId, vanId: v.id, type: 'rent_cab_licence', label: 'Rent-a-Motor-Cab / self-drive rental licence', expiry: d(500), status: st });
    addDoc({ ownerId: v.ownerId, vanId: v.id, type: 'puc', label: 'Pollution Under Control (PUC) certificate', expiry: v.id === 'v2' ? d(12) : d(150), status: st });
    addDoc({ ownerId: v.ownerId, vanId: v.id, type: 'fitness', label: 'Fitness certificate (commercial vehicle)', expiry: d(380), status: st });
    addDoc({ ownerId: v.ownerId, vanId: v.id, type: 'insurance', label: 'Commercial comprehensive insurance (self-drive rental cover)', number: 'POL-' + (882100 + vans.indexOf(v)), insurer: pick(['ICICI Lombard', 'HDFC ERGO', 'Bajaj Allianz', 'New India Assurance']), expiry: v.id === 'v4' ? d(21) : v.id === 'v7' ? d(-3) : d(240), status: v.id === 'v7' ? 'action_required' : st, note: v.id === 'v7' ? 'Policy expired — upload the renewed policy to keep the listing live.' : '' });
    if (v.status === 'published' || v.id === 'v8') addDoc({ ownerId: v.ownerId, vanId: v.id, type: 'inspection', label: 'Safety & roadworthiness inspection report', expiry: d(pub ? 200 : 330), status: st });
  }
  for (const oid of ['u_owner1', 'u_owner2', 'u_owner3', 'u_owner5', 'u_owner6', 'u_owner7', 'u_owner8']) {
    addDoc({ ownerId: oid, type: 'aadhaar', label: 'Aadhaar (masked)', number: 'XXXX-XXXX-' + (4000 + documents.length), status: 'verified' });
    addDoc({ ownerId: oid, type: 'pan', label: 'PAN card', number: 'XXXXX' + (1000 + documents.length) + 'K', status: 'verified' });
  }
  addDoc({ ownerId: 'u_owner4', type: 'aadhaar', label: 'Aadhaar (masked)', number: 'XXXX-XXXX-9034', status: 'pending', submittedAt: ts(-2) });
  addDoc({ ownerId: 'u_owner4', type: 'pan', label: 'PAN card', number: 'XXXXX5521L', status: 'pending', submittedAt: ts(-2) });
  addDoc({ ownerId: 'u_owner4', type: 'selfie', label: 'Live selfie', status: 'pending', submittedAt: ts(-2) });
  // v7 insurance expired → suspend
  vans.find(v => v.id === 'v7').status = 'suspended';
  vans.find(v => v.id === 'v7').verification.insurance = 'action_required';

  // Bookings: many past ones for analytics, plus curated ones for the demo traveller
  const bookings = [];
  const customers = ['u_cust2', 'u_cust3', 'u_cust4', 'u_cust5'];
  let bN = 1000;
  const mkBooking = (vanId, customerId, startOff, nights, status, extra = {}) => {
    const van = vans.find(v => v.id === vanId);
    const start = d(startOff), end = d(startOff + nights);
    const travelers = Math.min(van.sleeps, 2 + Math.floor(rnd() * 3));
    const pricing = App.quote(van, start, end);
    const b = {
      id: 'VY' + (bN++), vanId, ownerId: van.ownerId, customerId, start, end, nights, travelers,
      adults: Math.max(1, travelers - 1), children: travelers > 2 ? 1 : 0, pricing, status,
      paymentStatus: status === 'cancelled' ? 'refunded' : status === 'requested' ? 'authorised' : 'paid',
      depositStatus: status === 'completed' ? 'released' : status === 'confirmed' ? 'held' : 'none',
      driver: { name: users.find(u => u.id === customerId).name, licenceMasked: 'DL-XXXXXXXX' + (10 + Math.floor(rnd() * 89)), age: 28 + Math.floor(rnd() * 20) },
      createdAt: ts(startOff - 20 - Math.floor(rnd() * 20)), risk: { score: 5, flags: [] },
      itinerary: [], ...extra
    };
    bookings.push(b);
    return b;
  };
  // A few recent trips so the demo owner's "this month" numbers aren't empty
  mkBooking('v1', 'u_cust3', -14, 5, 'completed');
  mkBooking('v4', 'u_cust5', -21, 6, 'completed');
  mkBooking('v10', 'u_cust2', -9, 4, 'completed');
  mkBooking('v2', 'u_cust4', -6, 3, 'completed');
  const overlaps = (vanId, s, e) => bookings.some(b => b.vanId === vanId && b.status !== 'cancelled' && b.start < e && s < b.end);
  for (let i = 0, made = 0; made < 150 && i < 800; i++) {
    const v = pick(vans.filter(v => v.status !== 'in_review'));
    const off = -180 + Math.floor(rnd() * 170);
    const nights = v.minNights + Math.floor(rnd() * 5);
    if (off + nights >= 0 || overlaps(v.id, d(off), d(off + nights))) continue;
    mkBooking(v.id, pick(customers), off, nights, rnd() < 0.08 ? 'cancelled' : 'completed');
    made++;
  }
  const pastGoa = mkBooking('v6', 'u_cust1', -45, 5, 'completed');
  const upcoming = mkBooking('v9', 'u_cust1', 26, 7, 'confirmed', {
    itinerary: [
      { day: 1, title: 'Pickup in Leh & acclimatise', notes: 'Easy day. Shanti Stupa at sunset.' },
      { day: 2, title: 'Leh monasteries', notes: 'Thiksey morning prayers, Hemis.' },
      { day: 3, title: 'Khardung La → Nubra', notes: 'Camp at Hunder Dunes Camp.' },
      { day: 4, title: 'Nubra → Pangong via Shyok', notes: 'Fill water at Diskit.' },
      { day: 5, title: 'Pangong sunrise', notes: 'Pangong Lakeside Camp.' },
      { day: 6, title: 'Pangong → Leh via Chang La', notes: '' },
      { day: 7, title: 'Sangam & return', notes: 'Return van by 10:00 next day.' }
    ]
  });
  const requested = mkBooking('v3', 'u_cust1', 60, 4, 'requested');
  mkBooking('v1', 'u_cust2', 9, 5, 'requested');
  mkBooking('v5', 'u_cust3', 4, 6, 'confirmed');
  mkBooking('v1', 'u_cust4', 3, 4, 'confirmed');
  mkBooking('v10', 'u_cust5', 14, 3, 'confirmed');
  const risky = mkBooking('v5', 'u_cust4', 32, 12, 'requested');
  risky.risk = { score: 62, flags: ['High-value booking from an account under 30 days old', 'Different card country to profile'] };

  // Reviews for completed bookings
  const reviewTexts = [
    [5, 'Spotless van and super helpful owner. The handover walkthrough made us feel confident on mountain roads.'],
    [5, 'Our kids loved the bunks! Everything we needed was on board, even a kettle and fairy lights.'],
    [4, 'Great van and fair price. Pickup took a little longer than expected but the owner was very responsive.'],
    [5, 'Best trip we have ever done. Route suggestions from the owner were spot on.'],
    [4, 'Comfortable bed and a good kitchen. Solar kept the fridge running all week.'],
    [3, 'Van was good but the awning was hard to set up. Owner refunded the extra km charge without fuss.'],
    [5, 'Felt very safe — GPS tracker, first-aid kit and a 24x7 helpline number. Will book again.']
  ];
  const reviews = [];
  bookings.filter(b => b.status === 'completed').forEach((b, i) => {
    if (i % 2 === 1 && b !== pastGoa) return;
    const [rating, text] = b === pastGoa ? [5, 'Perfect beach van for Goa. Agonda campsite recommendation was a gem, and Meera replied within minutes every time.'] : pick(reviewTexts);
    reviews.push({
      id: 'r' + reviews.length, vanId: b.vanId, bookingId: b.id, authorId: b.customerId, ownerId: b.ownerId, rating,
      categories: { cleanliness: rating, accuracy: rating, communication: Math.min(5, rating + 1), value: rating },
      text, createdAt: new Date(new Date(b.end).getTime() + 2 * day).toISOString(), status: 'published',
      ownerReply: rnd() < 0.4 ? 'Thank you so much — you are welcome back any time!' : ''
    });
  });
  reviews.push({ id: 'r_flag', vanId: 'v2', bookingId: bookings.find(b => b.vanId === 'v2' && b.status === 'completed')?.id, authorId: 'u_cust4', ownerId: 'u_owner1', rating: 1, categories: { cleanliness: 1, accuracy: 1, communication: 1, value: 1 }, text: 'Terrible!!! Call me on 98xxxxxx12 and I will tell you a cheaper van outside this site.', createdAt: ts(-6), status: 'flagged', flagReason: 'Contains contact details / off-platform solicitation', ownerReply: '' });

  // Messages
  const threads = [
    { id: 't1', vanId: 'v9', bookingId: upcoming.id, customerId: 'u_cust1', ownerId: 'u_owner3', messages: [
      { from: 'u_cust1', text: 'Hi Tenzin! We are 2 adults and 2 kids (9 and 12). Any tips for acclimatising?', at: ts(-5, 9) },
      { from: 'u_owner3', text: 'Julley! Plan two easy days in Leh before Khardung La. I will leave an oximeter and extra blankets in the van.', at: ts(-5, 11) },
      { from: 'u_cust1', text: 'Amazing, thank you. Is there space for a small cool box?', at: ts(-4, 18) }
    ] },
    { id: 't2', vanId: 'v6', bookingId: pastGoa.id, customerId: 'u_cust1', ownerId: 'u_owner2', messages: [
      { from: 'u_owner2', text: 'Hope you had a great trip! Deposit has been released.', at: ts(-38, 12) },
      { from: 'u_cust1', text: 'We loved it. Review coming soon!', at: ts(-38, 14) }
    ] },
    { id: 't3', vanId: 'v3', bookingId: requested.id, customerId: 'u_cust1', ownerId: 'u_owner1', messages: [
      { from: 'u_cust1', text: 'Hi Rohan, I have driven the Manali–Leh highway twice. Happy to share my licence details if needed.', at: ts(-1, 16) }
    ] }
  ];

  // Transactions and payouts
  const transactions = [];
  let txN = 1;
  for (const b of bookings) {
    if (b.status === 'completed' || b.status === 'confirmed') {
      transactions.push({ id: 'tx' + (txN++), type: 'payment', bookingId: b.id, customerId: b.customerId, ownerId: b.ownerId, amount: b.pricing.total, at: b.createdAt, status: 'captured', method: pick(['UPI', 'Visa •• 4242', 'Mastercard •• 5100', 'Net banking']) });
    }
    if (b.status === 'completed') {
      transactions.push({ id: 'tx' + (txN++), type: 'payout', bookingId: b.id, ownerId: b.ownerId, amount: b.pricing.ownerPayout, at: new Date(new Date(b.start).getTime() + 1 * day).toISOString(), status: 'paid' });
    }
    if (b.status === 'cancelled') {
      transactions.push({ id: 'tx' + (txN++), type: 'refund', bookingId: b.id, customerId: b.customerId, ownerId: b.ownerId, amount: b.pricing.total, at: b.createdAt, status: 'refunded' });
    }
  }

  const disputes = [
    { id: 'dp1', bookingId: 'VY1000', raisedBy: 'owner', reason: 'Damage to awning arm; traveller disputes the charge.', amount: 4500, status: 'open', createdAt: ts(-3), messages: [] },
    { id: 'dp2', bookingId: 'VY1003', raisedBy: 'customer', reason: 'Fridge stopped working on day 2 — requesting partial refund.', amount: 3000, status: 'open', createdAt: ts(-1), messages: [] }
  ];

  const notifications = [
    { id: 'n1', userId: 'u_owner1', text: 'PUC certificate for Snowline Pop-top expires in 12 days.', at: ts(0, 8), read: false, link: '#/owner/documents' },
    { id: 'n2', userId: 'u_owner1', text: 'New booking request from Arjun Rao for Himalayan Explorer.', at: ts(-1, 12), read: false, link: '#/owner/bookings' },
    { id: 'n3', userId: 'u_cust1', text: 'Your trip to Ladakh starts in 26 days. Add stops to your itinerary!', at: ts(-1, 9), read: false, link: '#/account/trips/' + upcoming.id },
    { id: 'n4', userId: 'u_owner2', text: 'Insurance for Tea Hills Tiny Van has expired. The listing is paused until you upload a renewed policy.', at: ts(-2, 9), read: false, link: '#/owner/documents' },
    { id: 'n5', userId: 'u_admin', text: 'Karan Singh submitted KYC documents for review.', at: ts(-2, 11), read: false, link: '#/admin/verifications' }
  ];

  const audit = [
    { id: 'a1', actorId: 'u_admin', action: 'listing.approve', target: 'v9 Leh Family Motorhome', at: ts(-90) },
    { id: 'a2', actorId: 'u_admin', action: 'document.verify', target: 'doc insurance for v5', at: ts(-60) },
    { id: 'a3', actorId: 'system', action: 'listing.suspend', target: 'v7 Tea Hills Tiny Van — insurance expired', at: ts(-2) },
    { id: 'a4', actorId: 'u_admin', action: 'user.login', target: 'admin@vanyatra.in', at: ts(0, 8) }
  ];

  return {
    version: 3, destinations, users, owners, vans, documents, bookings, reviews, threads, transactions,
    disputes, notifications, audit, outbox: [], session: null, recentSearches: []
  };
};
