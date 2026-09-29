/*
 * Languages: English and Hindi.
 *
 * App.t('English text') returns the text in the chosen language, falling back to
 * English, so untranslated screens keep working. Keys are the English strings
 * themselves; {name} placeholders are filled from the second argument.
 *
 * DRAFT: the Hindi below covers the site chrome (header, menus, tab bar, footer),
 * the home page, search and the analytics notice. It was written without a native
 * reviewer and must be checked by a native Hindi speaker before launch (see
 * docs/CHANGELOG.md). Booking, account and owner screens are still English.
 */
window.App = window.App || {};
(() => {
  const KEY = 'vanyatra.lang.v1';
  App.LANGS = { en: 'English', hi: 'हिन्दी' };

  const HI = {
    // Header and menus
    'Destinations': 'गंतव्य',
    'Find a van': 'वैन खोजें',
    'Map': 'नक्शा',
    'Plan a trip': 'यात्रा की योजना',
    'Deals': 'ऑफ़र',
    'List your van': 'अपनी वैन लिस्ट करें',
    'Help': 'मदद',
    'Sign in': 'साइन इन',
    'Sign up': 'साइन अप',
    'Menu': 'मेनू',
    'Close menu': 'मेनू बंद करें',
    'My trips': 'मेरी यात्राएँ',
    'Saved vans': 'सहेजी गई वैन',
    'Messages': 'संदेश',
    'Owner dashboard': 'मालिक डैशबोर्ड',
    'Verification': 'सत्यापन',
    'Admin': 'एडमिन',
    'Admin console': 'एडमिन कंसोल',
    'Profile & privacy': 'प्रोफ़ाइल और गोपनीयता',
    'Sign out': 'साइन आउट',
    'Notifications': 'सूचनाएँ',
    'Notifications, {n} unread': 'सूचनाएँ, {n} अपठित',
    'Mark all read': 'सभी को पढ़ा हुआ मानें',
    'You’re all caught up.': 'कोई नई सूचना नहीं है।',
    'VanYatra home': 'VanYatra होम',
    'Language': 'भाषा',
    // Tab bar
    'Home': 'होम',
    'Explore': 'घूमें',
    'Search': 'खोज',
    'Dashboard': 'डैशबोर्ड',
    'Account': 'खाता',
    'Queue': 'कतार',
    'Trips': 'यात्राएँ',
    // Footer
    'India’s camper van marketplace. Every owner is ID-verified, every van is insured and safety-inspected.': 'भारत का कैंपर वैन मार्केटप्लेस। हर मालिक की पहचान सत्यापित है, हर वैन बीमित है और उसकी सुरक्षा जाँच हो चुकी है।',
    '24×7 roadside help': '24×7 सड़क सहायता',
    'Emergency': 'आपातकाल',
    'All vans': 'सभी वैन',
    'Trip planner': 'ट्रिप प्लानर',
    'First-timer’s guide': 'पहली यात्रा के लिए गाइड',
    'Family trips': 'परिवार के साथ यात्राएँ',
    'Owners': 'वैन मालिक',
    'Owner requirements': 'मालिकों के लिए ज़रूरी शर्तें',
    'Support': 'सहायता',
    'Trust & safety': 'भरोसा और सुरक्षा',
    'FAQs': 'अक्सर पूछे जाने वाले सवाल',
    'Contact support': 'सहायता से संपर्क करें',
    'Cancellation & refunds': 'रद्दीकरण और रिफ़ंड',
    'Terms': 'शर्तें',
    'Privacy': 'गोपनीयता',
    'Reset demo data': 'डेमो डेटा रीसेट करें',
    'The Hindi translation is a draft, and some pages are still in English.': 'हिन्दी अनुवाद अभी ड्राफ़्ट है, और कुछ पेज अभी अंग्रेज़ी में हैं।',
    // Home page
    'Camper van rentals across India': 'पूरे भारत में कैंपर वैन किराये पर',
    'Discover Himalayan passes, Goan beaches and Kerala backwaters. Book a verified, insured camper van in minutes — with transparent prices and no surprises.': 'हिमालय के दर्रे, गोवा के समुद्र तट और केरल के बैकवॉटर देखें। कुछ ही मिनटों में सत्यापित और बीमित कैंपर वैन बुक करें — साफ़ क़ीमतें, कोई छिपा शुल्क नहीं।',
    'verified van': 'सत्यापित वैन',
    'Insurance included': 'बीमा शामिल',
    'Free cancellation on many vans': 'कई वैन पर मुफ़्त रद्दीकरण',
    'How it works': 'यह कैसे काम करता है',
    'From dream to driveway in three steps': 'तीन आसान कदमों में सपने से सफ़र तक',
    'Pick a destination': 'गंतव्य चुनें',
    'Browse routes, best seasons, campsites and family tips for every region.': 'हर इलाक़े के रास्ते, सही मौसम, कैंपसाइट और परिवार के लिए सुझाव देखें।',
    'Choose your van': 'अपनी वैन चुनें',
    'Compare real photos, beds, amenities and live availability. Every owner is verified.': 'असली फ़ोटो, बिस्तर, सुविधाएँ और उपलब्धता की तुलना करें। हर मालिक सत्यापित है।',
    'Book & hit the road': 'बुक करें और निकल पड़ें',
    'Pay securely, see every rupee up front, and get your trip plan and pickup details instantly.': 'सुरक्षित भुगतान करें, हर रुपये का हिसाब पहले देखें, और यात्रा योजना व पिकअप की जानकारी तुरंत पाएँ।',
    'New to van life? Start here': 'वैन यात्रा में नए हैं? यहाँ से शुरू करें',
    'In season now': 'अभी मौसम में',
    'Where will the road take you?': 'सड़क आपको कहाँ ले जाएगी?',
    'All destinations →': 'सभी गंतव्य →',
    'Top rated': 'सबसे ज़्यादा पसंद की गई',
    'Loved by travellers': 'यात्रियों की पसंद',
    'See all vans →': 'सभी वैन देखें →',
    'Verified owners': 'सत्यापित मालिक',
    'Government ID, vehicle ownership and legal permits checked by our team.': 'सरकारी पहचान, वाहन का स्वामित्व और क़ानूनी परमिट हमारी टीम जाँचती है।',
    'Insured & inspected': 'बीमित और जाँची हुई',
    'Commercial insurance and a 10-point safety inspection before any van goes live.': 'हर वैन लाइव होने से पहले व्यावसायिक बीमा और 10-बिंदु सुरक्षा जाँच।',
    'Secure payments': 'सुरक्षित भुगतान',
    'Pay on VanYatra only. Owners are paid after pickup; deposits are held, not spent.': 'भुगतान सिर्फ़ VanYatra पर करें। मालिकों को पिकअप के बाद भुगतान मिलता है; जमा राशि रोकी जाती है, ख़र्च नहीं होती।',
    '24×7 support': '24×7 सहायता',
    'Roadside assistance and a real human on the phone, day or night.': 'सड़क पर मदद और फ़ोन पर असली इंसान, दिन हो या रात।',
    'Explore by map': 'नक्शे पर देखें',
    'Vans and campsites near your route': 'आपके रास्ते के पास वैन और कैंपसाइट',
    'Open full map →': 'पूरा नक्शा खोलें →',
    'For van owners': 'वैन मालिकों के लिए',
    'Earn from your camper van': 'अपनी कैंपर वैन से कमाएँ',
    'List for free, set your own prices and rules, and get paid securely. Our step-by-step onboarding gets you verified and live.': 'मुफ़्त में लिस्ट करें, अपनी क़ीमतें और नियम तय करें, और सुरक्षित भुगतान पाएँ। हमारी आसान प्रक्रिया से सत्यापन कराएँ और लाइव हो जाएँ।',
    'Start listing': 'लिस्टिंग शुरू करें',
    // Search form and date picker
    'Find a camper van': 'कैंपर वैन खोजें',
    'Where to?': 'कहाँ जाना है?',
    'Anywhere in India': 'भारत में कहीं भी',
    'Travellers': 'यात्री',
    'Van type': 'वैन का प्रकार',
    'Any type': 'कोई भी',
    'Search vans': 'वैन खोजें',
    'Pickup': 'पिकअप',
    'Return': 'वापसी',
    'Add date': 'तारीख़ चुनें',
    // Analytics notice
    'May we count anonymous page visits and booking steps to improve VanYatra? No ads, no third-party trackers.': 'क्या हम VanYatra को बेहतर बनाने के लिए गुमनाम पेज विज़िट और बुकिंग के चरण गिन सकते हैं? कोई विज्ञापन नहीं, कोई थर्ड-पार्टी ट्रैकर नहीं।',
    'No thanks': 'नहीं, धन्यवाद',
    'Allow': 'अनुमति दें'
  };
  const DICTS = { hi: HI };

  const saved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  App.lang = App.LANGS[saved()] ? saved() : 'en';
  const applyLang = () => { document.documentElement.lang = App.lang === 'hi' ? 'hi' : 'en-IN'; };
  applyLang();

  App.t = (text, vars) => {
    let out = (DICTS[App.lang] && DICTS[App.lang][text]) || text;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  };
  // "5 verified vans" / "5 सत्यापित वैन" (Hindi nouns here don't change in the plural)
  App.tn = (n, word) => (App.lang !== 'en' && DICTS[App.lang]?.[word] ? `${n} ${DICTS[App.lang][word]}` : App.plural(n, word));

  App.setLang = (lang) => {
    if (!App.LANGS[lang] || lang === App.lang) return;
    App.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch { /* private mode: this visit only */ }
    applyLang();
    App.track && App.track('language', { lang });
    App._keepScroll = true;
    App.renderFooter(); App.render();
    const bar = document.getElementById('consent-bar');
    if (bar) { bar.remove(); App.renderConsent(); }
  };
  // Switch control: shows the other language, in that language
  App.langSwitch = (cls = '') => {
    const other = App.lang === 'en' ? 'hi' : 'en';
    return App.h`<button type="button" class="lang-switch ${cls}" data-lang="${other}" lang="${other === 'hi' ? 'hi' : 'en'}" aria-label="${App.t('Language')}: ${App.LANGS[other]}">${App.icon('languages')} ${App.LANGS[other]}</button>`;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.lang-switch');
    if (b) App.setLang(b.dataset.lang);
  });
})();
