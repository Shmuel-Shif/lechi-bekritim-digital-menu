/**
 * LECHAIM — Entry gate (Stage 1 + Stage 2 session resume)
 * Home welcome → order type → table (dine-in only).
 * Persists dine-in table session via LechaimOrderSession (localStorage).
 */
(function () {
  'use strict';

  const Session = window.LechaimOrderSession;
  const TABLE_MIN = Session?.TABLE_MIN || 60;
  const TABLE_MAX = Session?.TABLE_MAX || 73;

  function isStaffOrderPage() {
    return document.body?.getAttribute('data-staff-order') === '1';
  }

  const COPY = {
    en: {
      welcome: '✦ Welcome ✦',
      title: 'to Lechaim Restaurant in Crete',
      kosher: 'Mehadrin Kosher',
      hoursSummary: 'Sun–Thu 14:00–21:00 · Fri–Sat closed',
      promptOrder: 'How would you like to order?',
      promptTable: 'Choose the number of the table you are seated at.',
      tableFind: 'The table number is on the table.',
      tableHint1: 'Only one person at the table should place the order through the system.',
      tableHint2: 'Other guests can choose "View the menu" on the main page to browse dishes, prices, and descriptions.',
      tableHint2DineIn: 'Other guests can choose "View the menu" here. Only the table representative can send the order.',
      tableHowTitle: 'How does it work?',
      tableHowText: 'Add your favorite dishes to the cart, review that everything is correct and nothing was forgotten, then tap Send order and the restaurant starts preparing your order right away.',
      tablePickTable: 'Choose a table',
      tableBrowseMenu: 'View the menu',
      promptPickup: 'Takeaway details',
      promptPickupWithDelivery: 'Takeaway & delivery details',
      promptDelivery: 'Delivery details',
      dineIn: 'Dine In',
      dineInHint: 'Join us for a meal at the restaurant',
      takeAway: 'Takeaway',
      takeAwayWithDelivery: 'Takeaway / Delivery',
      takeAwayHint: 'Order and pick up from the restaurant',
      takeAwayHintWithDelivery: 'Pickup from the restaurant or delivery (€10, 30–45 minutes) · min. order €100',
      deliveryOrder: 'Delivery',
      deliveryOrderHint: 'Delivery €10 · 30–45 minutes · minimum order €100',
      fulfillmentType: 'Order type',
      fulfillmentPickup: 'Takeaway',
      fulfillmentDelivery: 'Delivery',
      customerAddress: 'Address *',
      pickupAddressRequired: 'Please enter a delivery address',
      customerLocation: 'Exact location link (optional)',
      customerLocationHint: 'It really helps us find the delivery. Paste a Google Maps or Waze link',
      pickupLocationRequired: 'Please paste an exact location link',
      pickupLocationInvalid: 'The link is invalid. Please paste a Google Maps or Waze link',
      deliveryTime: 'Delivery time',
      shabbatOrders: 'Shabbat Orders',
      shabbatOrdersHint: 'Special menu for Shabbat',
      shabbatOrdersClosed: 'Shabbat orders are closed',
      shabbatOrdersClosedHint: 'You can order again starting Sunday',
      butcherShop: 'Our Butcher Shop',
      butcherShopHint: 'Mehadrin Chalak meat • Lubavitch shechita • Premium kashrut',
      browseMenu: 'View the menu',
      browseMenuHint: 'Discover all our dishes',
      aroundUs: 'What’s around us',
      aroundUsHint: 'Beach, harbour, Chabad and more',
      placeReservationHint: 'Reserve your table at the restaurant',
      entryFooterBrand: 'LECHAIM IN CRETE',
      entryFooterTagline: 'Mehadrin Kosher Restaurant • Crete',
      entryFollowUs: 'Follow us',
      ariaPhone: 'Call +30 694 650 2236',
      ariaMaps: 'Open location in Google Maps',
      scrollHintAria: 'Scroll down',
      aboutTitle: 'About us',
      aboutP1: 'Lechaim is a Mehadrin kosher restaurant in Crete.',
      aboutP2: 'We serve Mehadrin kosher Israeli food.',
      aboutP3: 'Located in the heart of Crete, we offer dine-in, takeaway, and special Shabbat orders.',
      aboutImageAlt: 'Lechaim restaurant in Crete',
      kosherTitle: 'Kashrut',
      kosherP1: 'The restaurant operates under Mehadrin EK kashrut, under the supervision of Rabbi Shneor Tornheim, Chabad Rabbi of Crete.',
      kosherP2: 'We insist on quality ingredients, a Mehadrin kosher kitchen, and high kashrut standards year-round.',
      kosherBadgeAlt: 'Mehadrin kosher badge',
      kosherCertificateBtn: 'Kosher certificate',
      kosherCertificateTitle: 'Kosher certificate',
      kosherCertificateAlt: 'Restaurant kosher certificate',
      kosherCertificateClose: 'Close',
      kosherCheck1: 'Mehadrin kosher',
      kosherCheck2: 'EK',
      kosherCheck3: 'Quality ingredients',
      delivery: 'Delivery',
      back: 'Back',
      comingSoon: 'Coming Soon',
      occupied: 'Occupied',
      tableOccupied: 'This table is occupied',
      langAria: 'Switch language – Hebrew / English',
      customerName: 'Customer name *',
      customerPhone: 'Phone *',
      customerNotes: 'Notes (optional)',
      pickupTime: 'Pickup time',
      pickupAsap: 'ASAP',
      pickupSelect: 'Select Time',
      continueToMenu: 'Continue to menu',
      pickupNameRequired: 'Please enter your name',
      pickupPhoneRequired: 'Please enter a valid phone number',
      pickupPhoneInvalid: 'Please enter a valid phone number',
      pickupTimeRequired: 'Please select a pickup time',
      pickupNoSlots: 'No pickup times left today — choose ASAP',
      pickupClosedTitle: 'Not available right now.',
      pickupClosedText: 'Takeaway orders can be placed Sunday–Thursday.\nBetween 14:00 – 21:00.',
      pickupClosedBrowse: 'View the menu',
      dineInClosedTitle: 'Not available right now.',
      dineInClosedText: 'Dine-in orders can be placed Sunday–Thursday.\nBetween 14:00 – 21:00.',
      dineInClosedBrowse: 'View the menu',
      placeReservation: 'Reserve a table',
      promptPlaceRes: 'Reserve a table',
      placeResName: 'Name',
      placeResPhone: 'WhatsApp',
      placeResPhoneCc: 'Country code',
      placeResParty: 'Guests',
      placeResDate: 'Date',
      placeResTime: 'Time',
      placeResNotes: 'Note',
      placeResNotesAdd: 'Add a note',
      placeResSubmit: 'Send',
      placeResThanksTitle: 'Thank you!',
      placeResThanksText: 'Got it. We’ll confirm on WhatsApp.',
      placeResThanksClose: 'Close',
      placeResNameRequired: 'Please enter your full name',
      placeResPhoneRequired: 'Please enter a valid phone number',
      placeResPartyRequired: 'Please enter number of guests (1–30)',
      placeResDateRequired: 'Please choose a date',
      placeResWeekendClosed: 'The restaurant is closed on Friday and Saturday — please choose another date',
      placeResTimeRequired: 'Please choose a time between 14:00 and 21:00',
      placeResSubmitFailed: 'Could not send the request. Please try again.',
      placeResCapacityTitle: 'No availability',
      placeResCapacityText: 'There are not enough seats available at the time you selected.\nPlease choose another time.',
      placeResCapacityClose: 'Close',
      placeResSlotFull: 'Full',
      placeResNoSlots: 'No available times for this party size — try another date',
      arriveAskTitle: 'Did you reserve a table?',
      arriveYes: 'Yes',
      arriveNo: 'No',
      arriveYesHint: 'Please enter the reservation name exactly as it was entered when booking, and the number of guests.',
      arriveName: 'Reservation name (exactly as booked) *',
      arriveParty: 'Number of guests *',
      arriveContinue: 'Continue to menu',
      arriveNoTitle: "That's fine",
      arriveNoText: "We're glad you came",
      arriveNameRequired: 'Please enter the reservation name exactly as it was booked',
      arrivePartyRequired: 'Please enter the number of guests (1–30)',
    },
    he: {
      welcome: '✦ ברוכים הבאים ✦',
      title: 'למסעדת לחיים בכרתים',
      kosher: 'כשר למהדרין',
      hoursSummary: 'א׳–ה׳ 14:00–21:00 · שישי–שבת סגור',
      promptOrder: 'איך תרצו להזמין?',
      promptTable: 'בחרו את מספר השולחן שעליו אתם יושבים.',
      tableFind: 'מספר השולחן נמצא על השולחן.',
      tableHint1: 'רק נציג אחד מהשולחן יבצע את ההזמנה דרך המערכת.',
      tableHint2: 'שאר הסועדים יכולים לבחור באפשרות "צפייה בתפריט" שבעמוד הראשי כדי לעיין במנות, במחירים ובתיאורים.',
      tableHint2DineIn: 'שאר הסועדים יכולים לבחור כאן "צפייה בתפריט". רק נציג השולחן שולח את ההזמנה.',
      tableHowTitle: 'איך זה עובד?',
      tableHowText: 'מוסיפים לסל המוצרים מנות שאתם אוהבים, עוברים על הסל שהכל נכון ולא שכחתם שום דבר, לוחצים שלח הזמנה והמסעדה מיד מתחילה לעבוד על ההזמנה שלכם.',
      tablePickTable: 'לבחירת שולחן',
      tableBrowseMenu: 'לצפייה בתפריט',
      promptPickup: 'פרטי איסוף עצמי',
      promptPickupWithDelivery: 'פרטי איסוף עצמי ומשלוחים',
      promptDelivery: 'פרטי משלוח',
      dineIn: 'ישיבה במקום',
      dineInHint: 'הצטרפו אלינו לארוחה במקום',
      takeAway: 'איסוף עצמי',
      takeAwayWithDelivery: 'איסוף עצמי / משלוחים',
      takeAwayHint: 'הזמינו ואספו מהמסעדה',
      takeAwayHintWithDelivery: 'איסוף מהמסעדה או משלוח בעלות €10 · זמן משלוח 30–45 דקות · מינימום הזמנה €100',
      deliveryOrder: 'משלוח',
      deliveryOrderHint: 'משלוח בעלות €10 · זמן משלוח 30–45 דקות · מינימום הזמנה €100',
      fulfillmentType: 'סוג הזמנה',
      fulfillmentPickup: 'איסוף עצמי',
      fulfillmentDelivery: 'משלוח',
      customerAddress: 'כתובת *',
      pickupAddressRequired: 'נא להזין כתובת למשלוח',
      customerLocation: 'קישור למיקום מדויק (אופציונלי)',
      customerLocationHint: 'יעזור לנו ממש להבין איפה המשלוח. העתיקו קישור מ-Google Maps או Waze',
      pickupLocationRequired: 'נא להדביק קישור למיקום המדויק',
      pickupLocationInvalid: 'הקישור אינו תקין. נא להדביק קישור מ-Google Maps או Waze',
      deliveryTime: 'שעת משלוח',
      shabbatOrders: 'הזמנות לשבת',
      shabbatOrdersHint: 'תפריט מיוחד לשבת קודש',
      shabbatOrdersClosed: 'הזמנות לשבת סגורות',
      shabbatOrdersClosedHint: 'ניתן להזמין שוב החל מיום ראשון',
      butcherShop: 'חנות הבשר של לחיים',
      butcherShopHint: 'בשר חלק כשר למהדרין • שחיטת ליובאוויטש • כשרות מהודרת',
      browseMenu: 'צפייה בתפריט',
      browseMenuHint: 'גלו את כל המנות שלנו',
      aroundUs: 'מה בסביבה שלנו',
      aroundUsHint: 'חוף, נמל, חב״ד ועוד',
      placeReservationHint: 'הבטיחו את מקומכם במסעדה',
      entryFooterBrand: 'LECHAIM IN CRETE',
      entryFooterTagline: 'מסעדה כשרה למהדרין • כרתים',
      entryFollowUs: 'עקבו אחרינו',
      ariaPhone: 'התקשרו +30 694 650 2236',
      ariaMaps: 'פתחו מיקום ב-Google Maps',
      scrollHintAria: 'גלול למטה',
      aboutTitle: 'מי אנחנו',
      aboutP1: 'מסעדת לחיים היא מסעדה כשרה למהדרין בכרתים.',
      aboutP2: 'אנו מגישים אוכל ישראלי כשר למהדרין.',
      aboutP3: 'המסעדה ממוקמת בלב כרתים ומציעה ישיבה במקום, איסוף עצמי והזמנות מיוחדות לשבת.',
      aboutImageAlt: 'מסעדת לחיים בכרתים',
      kosherTitle: 'כשרות',
      kosherP1: 'המסעדה פועלת תחת כשרות מהדרין EK, בפיקוחו של הרב שניאור טורנהיים רב חב״ד כרתים.',
      kosherP2: 'אנו מקפידים על חומרי גלם איכותיים, מטבח כשר למהדרין וסטנדרטים גבוהים של כשרות לאורך כל השנה.',
      kosherBadgeAlt: 'סמל כשרות למהדרין',
      kosherCertificateBtn: 'תעודת כשרות',
      kosherCertificateTitle: 'תעודת כשרות',
      kosherCertificateAlt: 'תעודת הכשרות של המסעדה',
      kosherCertificateClose: 'סגור',
      kosherCheck1: 'כשר למהדרין',
      kosherCheck2: 'EK',
      kosherCheck3: 'חומרי גלם איכותיים',
      delivery: 'משלוח',
      back: 'חזרה',
      comingSoon: 'Coming Soon',
      occupied: 'תפוס',
      tableOccupied: 'השולחן תפוס',
      langAria: 'החלפת שפה – עברית / English',
      customerName: 'שם הלקוח *',
      customerPhone: 'טלפון *',
      customerNotes: 'הערות (אופציונלי)',
      pickupTime: 'שעת איסוף',
      pickupAsap: 'בהקדם האפשרי',
      pickupSelect: 'בחירת שעה',
      continueToMenu: 'המשך לתפריט',
      pickupNameRequired: 'נא להזין שם',
      pickupPhoneRequired: 'נא להזין מספר טלפון תקין',
      pickupPhoneInvalid: 'נא להזין מספר טלפון תקין',
      pickupTimeRequired: 'נא לבחור שעת איסוף',
      pickupNoSlots: 'אין שעות פנויות היום — בחרו בהקדם האפשרי',
      pickupClosedTitle: 'לא זמין כרגע.',
      pickupClosedText: 'ניתן לבצע הזמנות לאיסוף עצמי בימי א - ה\nבין השעות 14:00 - 21:00.',
      pickupClosedBrowse: 'לצפייה בתפריט',
      dineInClosedTitle: 'לא זמין כרגע.',
      dineInClosedText: 'ניתן לבצע הזמנות לישיבה במקום בימי א - ה\nבין השעות 14:00 - 21:00.',
      dineInClosedBrowse: 'לצפייה בתפריט',
      placeReservation: 'הזמנת מקום',
      promptPlaceRes: 'הזמנת מקום',
      placeResName: 'שם',
      placeResPhone: 'וואטסאפ',
      placeResPhoneCc: 'קידומת מדינה',
      placeResParty: 'אנשים',
      placeResDate: 'תאריך',
      placeResTime: 'שעה',
      placeResNotes: 'הערה',
      placeResNotesAdd: 'הוסיפו הערה',
      placeResSubmit: 'שלח',
      placeResThanksTitle: 'תודה!',
      placeResThanksText: 'קיבלנו. נאשר בוואטסאפ.',
      placeResThanksClose: 'סגור',
      placeResNameRequired: 'נא להזין שם מלא',
      placeResPhoneRequired: 'נא להזין מספר טלפון תקין',
      placeResPartyRequired: 'נא להזין מספר סועדים (1–30)',
      placeResDateRequired: 'נא לבחור תאריך',
      placeResWeekendClosed: 'לא ניתן להזמין מקום בשישי ובשבת — המסעדה סגורה',
      placeResTimeRequired: 'נא לבחור שעה בין 14:00 ל־21:00',
      placeResSubmitFailed: 'שליחת הבקשה נכשלה. נסו שוב.',
      placeResCapacityTitle: 'אין מקום פנוי',
      placeResCapacityText: 'אין מספיק מקומות פנויים בשעה שבחרתם.\nאנא בחרו שעה אחרת.',
      placeResCapacityClose: 'סגור',
      placeResSlotFull: 'מלא',
      placeResNoSlots: 'אין שעות פנויות למספר הסועדים — נסו תאריך אחר',
      arriveAskTitle: 'הזמנתם מקום?',
      arriveYes: 'כן',
      arriveNo: 'לא',
      arriveYesHint: 'נא להזין את שם ההזמנה בדיוק כמו שהוזן בעת הזמנת המקום, ואת כמות האנשים',
      arriveName: 'שם ההזמנה (בדיוק כמו שהוזן) *',
      arriveParty: 'כמות האנשים *',
      arriveContinue: 'המשך לתפריט',
      arriveNoTitle: 'זה גם בסדר',
      arriveNoText: 'אנו שמחים שבאתם',
      arriveNameRequired: 'נא להזין את שם ההזמנה בדיוק כמו שהוזן',
      arrivePartyRequired: 'נא להזין כמות אנשים (1–30)',
    },
  };

  const gate = document.getElementById('entry-gate');
  if (!gate) return;

  let gateFocusTrapRelease = null;

  function activateGateFocusTrap() {
    if (gateFocusTrapRelease) return;
    const release = window.LechaimFocusTrap?.activate?.(gate);
    gateFocusTrapRelease = typeof release === 'function' ? release : null;
  }

  function releaseGateFocusTrap() {
    if (typeof gateFocusTrapRelease === 'function') gateFocusTrapRelease();
    gateFocusTrapRelease = null;
  }

  const stepOrder = document.getElementById('entry-step-order');
  const stepTable = document.getElementById('entry-step-table');
  const stepPickup = document.getElementById('entry-step-pickup');
  const stepPickupClosed = document.getElementById('entry-step-pickup-closed');
  const stepPlaceRes = document.getElementById('entry-step-place-res');
  const tablesEl = document.getElementById('entry-tables');
  const noticeEl = document.getElementById('entry-notice');
  const promptEl = document.getElementById('entry-prompt');
  const welcomeEl = document.getElementById('entry-hero-welcome');
  const titleEl = document.getElementById('entry-hero-title');
  const kosherEl = document.getElementById('entry-hero-kosher');
  const langToggle = document.getElementById('entry-lang-toggle');
  const scrollHintBtn = document.getElementById('entry-scroll-hint');
  const aboutSection = document.getElementById('entry-about');
  const aboutImg = aboutSection?.querySelector('[data-entry-i18n-alt="aboutImageAlt"]');
  const aboutSlides = document.getElementById('entry-about-slides');
  const tableBackBtn = stepTable?.querySelector('[data-entry-back]');
  let homeRevealObserver = null;
  let aboutSlideTimer = null;
  let aboutSlideIndex = 0;
  const pickupForm = document.getElementById('entry-pickup-form');
  const pickupName = document.getElementById('entry-pickup-name');
  const pickupPhone = document.getElementById('entry-pickup-phone');
  const pickupAddress = document.getElementById('entry-pickup-address');
  const pickupAddressField = document.getElementById('entry-pickup-address-field');
  const pickupLocation = document.getElementById('entry-pickup-location');
  const pickupLocationField = document.getElementById('entry-pickup-location-field');
  const pickupTimeFieldset = document.getElementById('entry-pickup-time-fieldset');
  const fulfillmentFieldset = document.getElementById('entry-pickup-fulfillment')
    || document.querySelector('.entry-pickup__fulfillment');
  const fulfillmentPickup = document.getElementById('entry-fulfillment-pickup');
  const fulfillmentDelivery = document.getElementById('entry-fulfillment-delivery');
  const fulfillmentDeliveryRow = document.getElementById('entry-fulfillment-delivery-row');
  const takeAwayLabelEl = gate?.querySelector('[data-order-type="takeaway"] [data-entry-i18n="takeAway"]');
  const takeAwayHintEl = gate?.querySelector('[data-order-type="takeaway"] [data-entry-i18n="takeAwayHint"]');
  const deliveryBtnEl = document.getElementById('entry-delivery-btn')
    || gate?.querySelector('[data-order-type="delivery"]');
  const shabbatLinkEl = document.getElementById('entry-shabbat-link');
  const shabbatLabelEl = shabbatLinkEl?.querySelector('[data-entry-i18n="shabbatOrders"]');
  const shabbatHintEl = shabbatLinkEl?.querySelector('[data-entry-i18n="shabbatOrdersHint"]');
  const pickupNotes = document.getElementById('entry-pickup-notes');
  const pickupAsap = document.getElementById('entry-pickup-asap');
  const pickupSelect = document.getElementById('entry-pickup-select');
  const pickupSlot = document.getElementById('entry-pickup-slot');
  const pickupError = document.getElementById('entry-pickup-error');
  const pickupClosedBrowse = document.getElementById('entry-pickup-closed-browse');
  const placeResForm = document.getElementById('entry-place-res-form');
  const placeResName = document.getElementById('entry-place-res-name');
  const placeResPhone = document.getElementById('entry-place-res-phone');
  const placeResPhoneCc = document.getElementById('entry-place-res-phone-cc');
  const placeResParty = document.getElementById('entry-place-res-party');
  const placeResDate = document.getElementById('entry-place-res-date');
  const placeResTime = document.getElementById('entry-place-res-time');
  const placeResNotes = document.getElementById('entry-place-res-notes');
  const placeResNotesToggle = document.getElementById('entry-place-res-notes-toggle');
  const placeResNotesField = document.getElementById('entry-place-res-notes-field');
  const placeResError = document.getElementById('entry-place-res-error');
  const placeResSubmit = document.getElementById('entry-place-res-submit');
  const placeResThanks = document.getElementById('entry-place-res-thanks');
  const placeResThanksBackdrop = document.getElementById('entry-place-res-thanks-backdrop');
  const placeResThanksClose = document.getElementById('entry-place-res-thanks-close');
  const placeResCapacity = document.getElementById('entry-place-res-capacity');
  const placeResCapacityBackdrop = document.getElementById('entry-place-res-capacity-backdrop');
  const placeResCapacityClose = document.getElementById('entry-place-res-capacity-close');
  const arriveModal = document.getElementById('entry-arrive-modal');
  const arriveYesBtn = document.getElementById('entry-arrive-yes');
  const arriveNoBtn = document.getElementById('entry-arrive-no');
  const arriveForm = document.getElementById('entry-arrive-form');
  const arriveName = document.getElementById('entry-arrive-name');
  const arriveParty = document.getElementById('entry-arrive-party');
  const arriveError = document.getElementById('entry-arrive-error');
  const arriveYesBack = document.getElementById('entry-arrive-yes-back');
  const arriveWelcomeContinue = document.getElementById('entry-arrive-welcome-continue');
  const tableModal = document.getElementById('entry-table-modal');
  const tableModalBackdrop = document.getElementById('entry-table-modal-backdrop');
  const tableModalPick = document.getElementById('entry-table-modal-pick');
  const tableModalBrowse = document.getElementById('entry-table-modal-browse');
  let tableModalTrapRelease = null;

  const kosherCertBtn = document.getElementById('entry-kosher-certificate-btn');
  const kosherLightbox = document.getElementById('entry-kosher-lightbox');
  const kosherLightboxBackdrop = document.getElementById('entry-kosher-lightbox-backdrop');
  const kosherLightboxClose = document.getElementById('entry-kosher-lightbox-close');
  let kosherLightboxTrapRelease = null;
  let kosherLightboxLastFocus = null;
  let placeResThanksTrapRelease = null;
  let placeResCapacityTrapRelease = null;
  let arriveTrapRelease = null;
  let pendingArriveTable = null;
  let placeResSlotsToken = 0;

  const state = {
    orderType: null, // 'dine-in' | 'takeaway'
    lang: 'he',
    tableNumber: null,
    customerName: '',
    customerPhone: '',
    customerNotes: '',
    customerAddress: '',
    fulfillmentType: 'pickup', // 'pickup' | 'delivery'
    deliveryFee: null,
    pickupType: 'ASAP', // 'ASAP' | 'TIME'
    pickupTime: null,
    /** Admin flag: when true, hide delivery button on customer UI */
    deliveriesClosed: false,
    /** Admin flag: when false, Shabbat card is disabled on the home page */
    shabbatOrdersEnabled: true,
  };

  let noticeTimer = null;
  let started = false;
  let changingTable = false;

  function t(key) {
    try {
      const overlay = window.LechaimAppSettings?.copy?.(key, state.lang);
      if (overlay) return overlay;
    } catch (_) { /* keep static fallback */ }
    return (COPY[state.lang] || COPY.en)[key] || key;
  }

  function applyDocumentDir() {
    const dir = state.lang === 'he' ? 'rtl' : 'ltr';
    const shell = document.getElementById('entry-shell');
    if (shell) shell.dir = dir;
  }

  function updateLangToggleUI() {
    langToggle?.querySelectorAll('[data-lang]').forEach((opt) => {
      opt.classList.toggle('lang-toggle__option--active', opt.dataset.lang === state.lang);
    });
    if (langToggle) langToggle.setAttribute('aria-label', t('langAria'));
  }

  function applyEntryCopy() {
    if (welcomeEl) welcomeEl.textContent = t('welcome');
    if (titleEl) titleEl.textContent = t('title');
    if (kosherEl) kosherEl.textContent = t('kosher');

    gate.querySelectorAll('[data-entry-i18n]').forEach((el) => {
      const key = el.getAttribute('data-entry-i18n');
      if (key && COPY.en[key] != null) {
        let text = t(key);
        /* Shabbat closed wording only — takeaway/delivery are separate buttons */
        if (key === 'shabbatOrders') {
          text = state.shabbatOrdersEnabled ? t('shabbatOrders') : t('shabbatOrdersClosed');
        } else if (key === 'shabbatOrdersHint') {
          text = state.shabbatOrdersEnabled ? t('shabbatOrdersHint') : t('shabbatOrdersClosedHint');
        }
        el.innerHTML = String(text).includes('\n')
          ? String(text).split('\n').map((line) => line.replace(/</g, '&lt;')).join('<br>')
          : text;
      }
    });
    if (arriveModal && !gate.contains(arriveModal)) {
      arriveModal.querySelectorAll('[data-entry-i18n]').forEach((el) => {
        const key = el.getAttribute('data-entry-i18n');
        if (key && COPY.en[key] != null) {
          const text = t(key);
          el.innerHTML = String(text).includes('\n')
            ? String(text).split('\n').map((line) => line.replace(/</g, '&lt;')).join('<br>')
            : text;
        }
      });
    }

    if (gate.dataset.mode === 'dine-in-only') {
      const hint2 = document.getElementById('entry-table-hint-2');
      if (hint2) hint2.textContent = t('tableHint2DineIn');
      if (tableModalBrowse) {
        tableModalBrowse.hidden = false;
        tableModalBrowse.setAttribute('aria-hidden', 'false');
        tableModalBrowse.removeAttribute('tabindex');
      }
    }

    gate.querySelectorAll('[data-entry-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-entry-i18n-aria');
      if (key && COPY.en[key] != null) el.setAttribute('aria-label', t(key));
    });

    if (aboutImg) {
      const altKey = aboutImg.getAttribute('data-entry-i18n-alt');
      if (altKey && COPY.en[altKey] != null) aboutImg.setAttribute('alt', t(altKey));
    }

    gate.querySelectorAll('[data-entry-i18n-alt]').forEach((el) => {
      const altKey = el.getAttribute('data-entry-i18n-alt');
      if (altKey && COPY.en[altKey] != null) el.setAttribute('alt', t(altKey));
    });

    if (stepPickupClosed && !stepPickupClosed.hidden) {
      const closedTitle = stepPickupClosed.querySelector('[data-entry-i18n="pickupClosedTitle"]');
      const closedText = stepPickupClosed.querySelector('[data-entry-i18n="pickupClosedText"]');
      const closedBrowse = stepPickupClosed.querySelector('[data-entry-i18n="pickupClosedBrowse"]');
      const isDineInClosed = state.orderType === 'dine-in';
      const titleKey = isDineInClosed ? 'dineInClosedTitle' : 'pickupClosedTitle';
      const textKey = isDineInClosed ? 'dineInClosedText' : 'pickupClosedText';
      const browseKey = isDineInClosed ? 'dineInClosedBrowse' : 'pickupClosedBrowse';
      if (closedTitle) closedTitle.textContent = t(titleKey);
      if (closedText) {
        const text = t(textKey);
        closedText.innerHTML = String(text).includes('\n')
          ? String(text).split('\n').map((line) => line.replace(/</g, '&lt;')).join('<br>')
          : text;
      }
      if (closedBrowse) closedBrowse.textContent = t(browseKey);
    }

    if (promptEl) {
      const onHome = Boolean(stepOrder && !stepOrder.hidden);
      /* dine-in.html: never flash "איך תרצו להזמין?" while waiting to open the table modal */
      const dineInOnlyBooting = gate.dataset.mode === 'dine-in-only'
        && (!stepTable || stepTable.hidden)
        && (!stepPickupClosed || stepPickupClosed.hidden)
        && (!stepOrder || stepOrder.hidden);
      promptEl.hidden = onHome || dineInOnlyBooting;
      if (!promptEl.hidden) {
        promptEl.classList.toggle('is-table-prompt', Boolean(stepTable && !stepTable.hidden));
        if (stepPickupClosed && !stepPickupClosed.hidden) {
          promptEl.textContent = state.orderType === 'dine-in' ? t('dineIn') : t('takeAway');
        } else if (stepPlaceRes && !stepPlaceRes.hidden) {
          promptEl.textContent = t('promptPlaceRes');
        } else if (stepPickup && !stepPickup.hidden) {
          promptEl.textContent = state.deliveriesClosed
            ? t('promptPickup')
            : t('promptPickupWithDelivery');
        } else if (stepTable && !stepTable.hidden) {
          promptEl.textContent = t('promptTable');
        } else {
          promptEl.textContent = t('promptOrder');
        }
      }
    }

    if (tableBackBtn) tableBackBtn.textContent = t('back');
    if (pickupSlot) pickupSlot.setAttribute('aria-label', t('pickupSelect'));

    updateLangToggleUI();
    applyDocumentDir();
    fillPlaceResPhoneCc();
  }

  function enterBrowseOnly() {
    enterMenu(buildMenuContext({
      browseOnly: true,
      orderType: null,
      tableNumber: null,
      lang: state.lang,
    }));
  }

  function stopAboutSlideshow() {
    if (aboutSlideTimer) {
      clearInterval(aboutSlideTimer);
      aboutSlideTimer = null;
    }
  }

  function startAboutSlideshow() {
    /* About section uses side-floating organic photos + scroll reveal — no slideshow */
    stopAboutSlideshow();
  }

  function teardownHomeReveal() {
    if (homeRevealObserver) {
      homeRevealObserver.disconnect();
      homeRevealObserver = null;
    }
    stopAboutSlideshow();
  }

  function setupHomeReveal() {
    teardownHomeReveal();
    if (!gate.classList.contains('is-home')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gate.querySelectorAll('.entry-gate__reveal').forEach((el) => el.classList.add('is-inview'));
      return;
    }

    const nodes = gate.querySelectorAll('.entry-gate__reveal');
    if (!nodes.length) return;

    const revealEl = (el) => {
      if (!el || el.classList.contains('is-inview')) return;
      el.classList.add('is-inview');
      homeRevealObserver?.unobserve(el);
    };

    /* Side floats sit off-canvas — observe their sections, not the floats */
    const aboutSectionEl = document.getElementById('entry-about');
    const kosherSectionEl = document.getElementById('entry-kosher');
    const revealSectionFloats = (section) => {
      if (!section) return;
      section.querySelectorAll('.entry-gate__about-float.entry-gate__reveal, .entry-gate__kashrut-badge.entry-gate__reveal').forEach(revealEl);
      section.querySelectorAll('.entry-gate__reveal').forEach(revealEl);
    };

    homeRevealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          if (entry.target.id === 'entry-about' || entry.target.id === 'entry-kosher') {
            revealSectionFloats(entry.target);
            homeRevealObserver?.unobserve(entry.target);
            return;
          }
          revealEl(entry.target);
        });
      },
      {
        root: gate,
        threshold: 0.12,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    nodes.forEach((el) => {
      el.classList.remove('is-inview');
      /* Floats/badge revealed via section observers */
      if (el.classList.contains('entry-gate__about-float')) return;
      if (el.classList.contains('entry-gate__kashrut-badge')) return;
      homeRevealObserver.observe(el);
    });

    if (aboutSectionEl) homeRevealObserver.observe(aboutSectionEl);
    if (kosherSectionEl) homeRevealObserver.observe(kosherSectionEl);

    /* Reveal above-the-fold cards immediately — skip About / Kosher */
    requestAnimationFrame(() => {
      const rootRect = gate.getBoundingClientRect();
      nodes.forEach((el) => {
        if (el.classList.contains('is-inview')) return;
        if (el.classList.contains('entry-gate__about-float')) return;
        if (el.classList.contains('entry-gate__kashrut-badge')) return;
        if (el.closest('#entry-about') || el.closest('#entry-kosher')) return;
        const rect = el.getBoundingClientRect();
        const visible = rect.top < rootRect.bottom && rect.bottom > rootRect.top + 8;
        if (!visible) return;
        revealEl(el);
      });
    });
  }

  function showStep(step) {
    [stepOrder, stepTable, stepPickup, stepPickupClosed, stepPlaceRes].forEach((el) => {
      if (!el) return;
      el.hidden = el !== step;
    });
    /* Premium home layout only on the main order-cards screen */
    const onHome = step === stepOrder;
    gate.classList.toggle('is-home', onHome);
    if (onHome) {
      gate.scrollTop = 0;
      setupHomeReveal();
      startAboutSlideshow();
    } else {
      teardownHomeReveal();
    }
    applyEntryCopy();
    applyClosedDayOnHome();
  }

  scrollHintBtn?.addEventListener('click', () => {
    aboutSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function showPlaceResError(message) {
    if (!placeResError) return;
    if (!message) {
      placeResError.hidden = true;
      placeResError.textContent = '';
      return;
    }
    placeResError.hidden = false;
    placeResError.textContent = message;
  }

  function fillPlaceResTimeSlots(unavailable = []) {
    if (!placeResTime) return;
    const slots = window.LechaimPlaceReservations?.buildArrivalSlots?.(placeResDate?.value)
      || (() => {
        const list = [];
        for (let m = 14 * 60; m <= 21 * 60; m += 30) {
          list.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
        }
        return list;
      })();
    const blocked = new Set(unavailable || []);
    const prev = placeResTime.value;
    const fullLabel = t('placeResSlotFull');
    placeResTime.innerHTML = [
      `<option value="">${t('placeResTime')}</option>`,
      ...slots.map((slot) => {
        const isFull = blocked.has(slot);
        const label = isFull ? `${slot} (${fullLabel})` : slot;
        return `<option value="${slot}"${isFull ? ' disabled' : ''}>${label}</option>`;
      }),
    ].join('');
    if (prev && slots.includes(prev) && !blocked.has(prev)) {
      placeResTime.value = prev;
    } else {
      placeResTime.value = '';
    }
  }

  function defaultPlaceResDate() {
    const api = window.LechaimPlaceReservations;
    const today = todayDateStr();
    if (typeof api?.nextOpenPlaceResDate === 'function') {
      return api.nextOpenPlaceResDate(today);
    }
    return today;
  }

  function isPlaceResWeekendDate(dateStr) {
    const api = window.LechaimPlaceReservations;
    if (typeof api?.isPlaceResWeekend === 'function') {
      return api.isPlaceResWeekend(dateStr);
    }
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay();
    return day === 5 || day === 6;
  }

  async function refreshPlaceResAvailableSlots() {
    if (!placeResTime) return;
    const token = ++placeResSlotsToken;
    const dateStr = String(placeResDate?.value || '').trim();
    const partySize = Math.floor(Number(placeResParty?.value));
    const api = window.LechaimPlaceReservations;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !api?.getUnavailableSlots) {
      fillPlaceResTimeSlots([]);
      return;
    }

    if (isPlaceResWeekendDate(dateStr)) {
      fillPlaceResTimeSlots(api.buildArrivalSlots?.(dateStr) || []);
      showPlaceResError(t('placeResWeekendClosed'));
      return;
    }

    try {
      /* Missing party size → still lock slots that are already at capacity (need ≥1) */
      const unavailable = await api.getUnavailableSlots(
        dateStr,
        Number.isFinite(partySize) && partySize >= 1 ? partySize : 1
      );
      if (token !== placeResSlotsToken) return;
      fillPlaceResTimeSlots(unavailable);
      const slots = api.buildArrivalSlots?.(dateStr) || [];
      const openCount = slots.filter((s) => !unavailable.includes(s)).length;
      if (!openCount && Number.isFinite(partySize) && partySize >= 1) {
        showPlaceResError(t('placeResNoSlots'));
      } else {
        showPlaceResError('');
      }
    } catch (err) {
      console.warn('[entry-gate] place-res occupancy failed', err);
      if (token !== placeResSlotsToken) return;
      fillPlaceResTimeSlots([]);
    }
  }

  function fillPlaceResPhoneCc() {
    if (!placeResPhoneCc) return;
    const html = window.LechaimPlaceReservations?.phoneCountryOptionsHtml?.(state.lang, { compact: true });
    if (!html) return;
    const prev = placeResPhoneCc.value;
    placeResPhoneCc.innerHTML = html;
    if ([...placeResPhoneCc.options].some((opt) => opt.value === prev)) {
      placeResPhoneCc.value = prev;
    }
    placeResPhoneCc.setAttribute('aria-label', t('placeResPhoneCc'));
  }

  function resetPlaceResForm() {
    placeResForm?.reset();
    showPlaceResError('');
    if (placeResNotesField) placeResNotesField.hidden = true;
    if (placeResNotesToggle) placeResNotesToggle.hidden = false;
    if (placeResDate) {
      placeResDate.min = todayDateStr();
      placeResDate.value = defaultPlaceResDate();
    }
    fillPlaceResTimeSlots([]);
    refreshPlaceResAvailableSlots();
  }

  function goToPlaceReservation() {
    resetPlaceResForm();
    showStep(stepPlaceRes);
    placeResName?.focus();
  }

  function setPlaceResModalOpen(isOpen) {
    gate.classList.toggle('is-place-res-modal-open', Boolean(isOpen));
    if (isOpen) {
      gate.scrollTop = 0;
    }
  }

  function mountPlaceResOverlay(el) {
    if (!el) return;
    /* Escape entry-gate overflow/transform so overlay always covers the viewport */
    if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
  }

  function closePlaceResModal(el, releaseRefSetter) {
    if (!el) return;
    releaseRefSetter();
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    const otherOpen = (placeResThanks && !placeResThanks.hidden)
      || (placeResCapacity && !placeResCapacity.hidden);
    if (!otherOpen) setPlaceResModalOpen(false);
  }

  function closePlaceResThanks() {
    closePlaceResModal(placeResThanks, () => {
      if (typeof placeResThanksTrapRelease === 'function') placeResThanksTrapRelease();
      placeResThanksTrapRelease = null;
    });
    goToOrderType();
  }

  function closePlaceResCapacity() {
    closePlaceResModal(placeResCapacity, () => {
      if (typeof placeResCapacityTrapRelease === 'function') placeResCapacityTrapRelease();
      placeResCapacityTrapRelease = null;
    });
    placeResTime?.focus();
  }

  function openPlaceResThanks() {
    if (!placeResThanks) {
      goToOrderType();
      return;
    }
    mountPlaceResOverlay(placeResThanks);
    setPlaceResModalOpen(true);
    placeResThanks.hidden = false;
    placeResThanks.setAttribute('aria-hidden', 'false');
    if (typeof placeResThanksTrapRelease === 'function') placeResThanksTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(placeResThanks);
    placeResThanksTrapRelease = typeof release === 'function' ? release : null;
    placeResThanksClose?.focus();
  }

  function openPlaceResCapacity() {
    if (!placeResCapacity) {
      showPlaceResError(t('placeResCapacityText').replace(/\n/g, ' '));
      return;
    }
    applyEntryCopy();
    mountPlaceResOverlay(placeResCapacity);
    setPlaceResModalOpen(true);
    placeResCapacity.hidden = false;
    placeResCapacity.setAttribute('aria-hidden', 'false');
    if (typeof placeResCapacityTrapRelease === 'function') placeResCapacityTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(placeResCapacity);
    placeResCapacityTrapRelease = typeof release === 'function' ? release : null;
    placeResCapacityClose?.focus();
  }

  async function submitPlaceResForm(event) {
    event.preventDefault();
    showPlaceResError('');

    const customerName = String(placeResName?.value || '').trim();
    const customerPhone = String(placeResPhone?.value || '').trim();
    const phoneCountry = String(placeResPhoneCc?.value || '').trim();
    const partySize = Math.floor(Number(placeResParty?.value));
    const reservationDate = String(placeResDate?.value || '').trim();
    const arrivalTime = String(placeResTime?.value || '').trim();
    const notes = String(placeResNotes?.value || '').trim();

    if (!customerName) {
      showPlaceResError(t('placeResNameRequired'));
      placeResName?.focus();
      return;
    }
    const phoneOk = typeof window.LechaimPlaceReservations?.isValidPlaceResPhone === 'function'
      ? window.LechaimPlaceReservations.isValidPlaceResPhone(customerPhone, phoneCountry)
      : (customerPhone.replace(/\D/g, '').length >= 8 && customerPhone.replace(/\D/g, '').length <= 15);
    if (!customerPhone || !phoneOk) {
      showPlaceResError(t('placeResPhoneRequired'));
      placeResPhone?.focus();
      return;
    }
    const maxParty = window.LechaimPlaceReservations?.CAPACITY_SEATS || 30;
    if (!Number.isFinite(partySize) || partySize < 1 || partySize > maxParty) {
      showPlaceResError(t('placeResPartyRequired'));
      placeResParty?.focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) {
      showPlaceResError(t('placeResDateRequired'));
      placeResDate?.focus();
      return;
    }
    if (isPlaceResWeekendDate(reservationDate)) {
      showPlaceResError(t('placeResWeekendClosed'));
      placeResDate?.focus();
      return;
    }
    const timeOk = window.LechaimPlaceReservations?.isValidArrivalTime?.(arrivalTime);
    if (!arrivalTime || !timeOk) {
      showPlaceResError(t('placeResTimeRequired'));
      placeResTime?.focus();
      return;
    }
    if (placeResTime?.selectedOptions?.[0]?.disabled) {
      openPlaceResCapacity();
      return;
    }

    if (!window.LechaimPlaceReservations?.createRequest) {
      showPlaceResError(t('placeResSubmitFailed'));
      return;
    }

    if (placeResSubmit) placeResSubmit.disabled = true;
    try {
      await window.LechaimPlaceReservations.createRequest({
        customerName,
        customerPhone,
        phoneCountry,
        partySize,
        reservationDate,
        arrivalTime,
        notes,
      });
      resetPlaceResForm();
      openPlaceResThanks();
    } catch (err) {
      if (err?.code === 'CAPACITY_EXCEEDED' || String(err?.message || '').includes('CAPACITY_EXCEEDED')) {
        await refreshPlaceResAvailableSlots();
        openPlaceResCapacity();
      } else {
        showPlaceResError(err?.message || t('placeResSubmitFailed'));
      }
    } finally {
      if (placeResSubmit) placeResSubmit.disabled = false;
    }
  }

  /* Set true to enforce takeaway day + clock hours — source: LechaimOpeningHours */
  const TAKEAWAY_DAY_HOURS_ENABLED = true;
  const Hours = () => window.LechaimOpeningHours || null;
  const TAKEAWAY_OPEN_HOUR = Hours()?.OPEN_HOUR ?? 14;
  const TAKEAWAY_CLOSE_HOUR = Hours()?.CLOSE_HOUR ?? 22; /* exclusive */

  /**
   * Takeaway only: Sun–Thu OPEN..CLOSE exclusive; closed Fri–Sat and outside hours.
   */
  async function refreshWeeklyHours() {
    if (typeof window.LechaimAppSettings?.load === 'function') {
      try { await window.LechaimAppSettings.load(); } catch (_) { /* keep local */ }
      return;
    }
    const api = window.LechaimSupabaseOrders;
    if (typeof api?.getWeeklyHours === 'function') {
      try {
        const text = await api.getWeeklyHours();
        if (text) Hours()?.setWeeklySchedule?.(JSON.parse(text));
      } catch (_) { /* keep local */ }
    }
  }

  function applyClosedDayOnHome() {
    const closed = !isDineInOrderingOpen();
    const label = state.lang === 'en' ? 'Closed today' : 'סגור היום';
    const dineHint = gate.querySelector('[data-order-type="dine-in"] [data-entry-i18n="dineInHint"]');
    const takeHint = gate.querySelector('[data-order-type="takeaway"] [data-entry-i18n="takeAwayHint"]');
    const delHint = gate.querySelector('[data-order-type="delivery"] [data-entry-i18n="deliveryOrderHint"]');
    if (closed) {
      if (dineHint) dineHint.textContent = label;
      if (takeHint) takeHint.textContent = label;
      if (delHint) delHint.textContent = label;
    }
    gate.querySelectorAll('[data-order-type="dine-in"], [data-order-type="takeaway"], [data-order-type="delivery"]').forEach((btn) => {
      btn.classList.toggle('is-day-closed', closed);
    });
  }

  function isTakeawayDayOpen() {
    if (!TAKEAWAY_DAY_HOURS_ENABLED) return true;
    if (typeof Hours()?.isWithinOrderingHours === 'function') {
      return Hours().isWithinOrderingHours();
    }
    const now = new Date();
    const day = now.getDay(); /* 0=Sun … 5=Fri 6=Sat */
    if (day === 5 || day === 6) return false;
    const hour = now.getHours();
    return hour >= TAKEAWAY_OPEN_HOUR && hour < TAKEAWAY_CLOSE_HOUR;
  }

  /* Set true to enforce dine-in day + clock hours at entry */
  const DINE_IN_DAY_HOURS_ENABLED = true;
  const DINE_IN_OPEN_HOUR = Hours()?.OPEN_HOUR ?? 14;
  const DINE_IN_CLOSE_HOUR = Hours()?.CLOSE_HOUR ?? 22; /* exclusive */

  /** Dine-in: Sun–Thu OPEN..CLOSE exclusive; closed Fri–Sat and outside hours. */
  function isDineInOrderingOpen() {
    if (!DINE_IN_DAY_HOURS_ENABLED) return true;
    if (typeof Hours()?.isWithinOrderingHours === 'function') {
      return Hours().isWithinOrderingHours();
    }
    const now = new Date();
    const day = now.getDay();
    if (day === 5 || day === 6) return false;
    const hour = now.getHours();
    return hour >= DINE_IN_OPEN_HOUR && hour < DINE_IN_CLOSE_HOUR;
  }

  function showOrderingClosedStep(orderType) {
    state.orderType = orderType;
    if (promptEl) {
      promptEl.textContent = orderType === 'dine-in' ? t('dineIn') : t('takeAway');
    }
    showStep(stepPickupClosed);
    pickupClosedBrowse?.focus();
  }

  function showNotice(message) {
    if (!noticeEl) return;
    noticeEl.hidden = false;
    noticeEl.textContent = message;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      noticeEl.hidden = true;
      noticeEl.textContent = '';
    }, 2600);
  }

  function buildTables() {
    if (!tablesEl) return;
    if (!tablesEl.childElementCount) {
      const fragment = document.createDocumentFragment();
      for (let n = TABLE_MIN; n <= TABLE_MAX; n += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'entry-gate__table';
        btn.dataset.table = String(n);
        btn.textContent = String(n);
        btn.setAttribute('aria-label', `Table ${n}`);
        fragment.appendChild(btn);
      }
      tablesEl.appendChild(fragment);
    }
  }

  function collectLocalOccupiedTables() {
    const occupied = new Set();
    const board = window.LechaimOrderEngine?.getTablesBoard?.() || [];
    board.forEach((row) => {
      if (row?.uiStatus === 'active' || row?.uiStatus === 'bill_requested') {
        occupied.add(Number(row.tableNumber));
      }
    });
    return occupied;
  }

  /**
   * A table is occupied when an open Supabase session has a live order.
   * Empty "active" sessions must not block table selection.
   */
  function remoteSessionHasLiveOrder(session, orders) {
    if (!session) return false;
    const list = Array.isArray(orders) ? orders : [];
    if (!list.length) return false;

    let hasItems = false;
    let total = 0;
    list.forEach((order) => {
      const lines = order?.order_items || [];
      lines.forEach((row) => {
        const qty = Number(row?.quantity ?? row?.qty) || 0;
        if (qty > 0) {
          hasItems = true;
          total += (Number(row.price ?? row.unit_price) || 0) * qty;
        }
      });
      if (!lines.length && Number(order?.total) > 0) {
        total += Number(order.total) || 0;
      }
    });
    return hasItems || total > 0;
  }

  let occupiedSbClient = null;
  let occupiedRealtimeChannel = null;
  let occupiedRealtimeTimer = null;

  function getOccupiedSupabaseClient() {
    const cfg = window.LECHAIM_SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey || !window.supabase?.createClient) return null;
    if (occupiedSbClient) return occupiedSbClient;
    occupiedSbClient = window.supabase.createClient(cfg.url, cfg.anonKey);
    return occupiedSbClient;
  }

  function getSharedOccupiedClient() {
    try {
      const fromInv = window.LechaimInventory?.getClient?.();
      if (fromInv) return fromInv;
    } catch (_) { /* ignore */ }
    try {
      const fromOrders = window.LechaimSupabaseOrders?.getClient?.();
      if (fromOrders) return fromOrders;
    } catch (_) { /* ignore */ }
    return getOccupiedSupabaseClient();
  }

  function startOccupiedRealtime() {
    if (!isStaffOrderPage() || occupiedRealtimeChannel) return;
    const sb = getSharedOccupiedClient();
    if (!sb?.channel) return;
    occupiedRealtimeChannel = sb
      .channel('staff-occupied-tables')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_sessions', filter: 'order_type=eq.dine_in' },
        () => {
          const tableStep = document.getElementById('entry-step-table');
          const onMap = document.body.classList.contains('entry-pending')
            && tableStep
            && !tableStep.hidden;
          if (!onMap) return;
          window.clearTimeout(occupiedRealtimeTimer);
          occupiedRealtimeTimer = window.setTimeout(() => {
            refreshOccupiedTables();
          }, 250);
        }
      )
      .subscribe();
  }

  async function collectRemoteOccupiedTables() {
    const occupied = new Set();

    if (isStaffOrderPage()) {
      try {
        const api = window.LechaimSupabaseOrders;
        if (typeof api?.getOpenSessions !== 'function') return occupied;
        const open = await api.getOpenSessions();
        (open || []).forEach((row) => {
          if (String(row.order_type || '') !== 'dine_in') return;
          const n = Number(row.table_number);
          if (Number.isFinite(n)) occupied.add(n);
        });
      } catch (err) {
        console.warn('[entry-gate] staff occupied fetch failed', err);
      }
      return occupied;
    }

    /* Lean path only: dine_in open sessions + qty/price (or order.total). */
    const sb = getOccupiedSupabaseClient();
    if (!sb) return occupied;

    try {
      const { data, error } = await sb
        .from('order_sessions')
        .select('table_number, session_id')
        .eq('order_type', 'dine_in')
        .in('status', ['active', 'bill_requested'])
        .not('table_number', 'is', null);

      if (error) {
        console.warn('[entry-gate] occupied tables query failed', error.message || error);
        return occupied;
      }

      const sessions = data || [];
      if (!sessions.length) return occupied;

      const ids = sessions.map((row) => row.session_id).filter(Boolean);
      const { data: orderRows, error: orderErr } = await sb
        .from('orders')
        .select('session_id, total, order_items(quantity, price)')
        .in('session_id', ids);

      if (orderErr) {
        console.warn('[entry-gate] occupied orders query failed', orderErr.message || orderErr);
        return occupied;
      }

      const bySession = new Map();
      ids.forEach((id) => bySession.set(id, []));
      (orderRows || []).forEach((order) => {
        const list = bySession.get(order.session_id);
        if (list) list.push(order);
      });

      sessions.forEach((session) => {
        if (remoteSessionHasLiveOrder(session, bySession.get(session.session_id) || [])) {
          occupied.add(Number(session.table_number));
        }
      });
    } catch (err) {
      console.warn('[entry-gate] occupied tables fetch failed', err);
    }

    return occupied;
  }

  async function refreshOccupiedTables() {
    if (!tablesEl) return;

    const occupied = collectLocalOccupiedTables();
    const remote = await collectRemoteOccupiedTables();
    remote.forEach((n) => occupied.add(n));

    /* While changing table, keep the current table selectable */
    if (changingTable && state.tableNumber != null) {
      occupied.delete(Number(state.tableNumber));
    }

    tablesEl.querySelectorAll('.entry-gate__table').forEach((btn) => {
      const n = Number(btn.dataset.table);
      const isOccupied = occupied.has(n);
      btn.classList.toggle('is-occupied', isOccupied);
      if (isStaffOrderPage()) {
        btn.disabled = false;
        btn.setAttribute('aria-disabled', 'false');
        btn.textContent = String(n);
        btn.setAttribute(
          'aria-label',
          isOccupied ? `Table ${n} — occupied` : `Table ${n}`
        );
        return;
      }
      btn.disabled = isOccupied;
      btn.setAttribute('aria-disabled', isOccupied ? 'true' : 'false');
      if (isOccupied) {
        btn.textContent = t('occupied');
        btn.setAttribute('aria-label', `${t('occupied')} — Table ${n}`);
      } else {
        btn.textContent = String(n);
        btn.setAttribute('aria-label', `Table ${n}`);
      }
    });
  }

  function highlightSelectedTable(tableNumber) {
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.toggle('is-selected', Number(btn.dataset.table) === tableNumber);
    });
  }

  function openGate() {
    document.body.classList.add('entry-pending');
    gate.hidden = false;
    gate.setAttribute('aria-hidden', 'false');
    activateGateFocusTrap();
  }

  function closeArriveModal() {
    if (!arriveModal) return;
    if (typeof arriveTrapRelease === 'function') arriveTrapRelease();
    arriveTrapRelease = null;
    arriveModal.hidden = true;
    arriveModal.setAttribute('aria-hidden', 'true');
    pendingArriveTable = null;
    const otherOpen = (placeResThanks && !placeResThanks.hidden)
      || (placeResCapacity && !placeResCapacity.hidden);
    if (!otherOpen) setPlaceResModalOpen(false);
  }

  function closeGate() {
    closeArriveModal();
    releaseGateFocusTrap();
    document.body.classList.remove('entry-pending');
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    changingTable = false;
  }

  function buildMenuContext(extra = {}) {
    const fromSession = Session?.toMenuContext?.({ lang: state.lang }) || {};
    const browseOnly = Boolean(extra.browseOnly);
    const orderType = browseOnly
      ? null
      : (extra.orderType != null
        ? extra.orderType
        : (state.orderType || fromSession.orderType || null));
    const isTakeaway = orderType === 'takeaway';
    const isButcher = orderType === 'butcher';
    const isDineIn = orderType === 'dine-in';
    const hasCustomer = isTakeaway || isButcher;

    return {
      browseOnly,
      orderType,
      tableNumber: browseOnly || isTakeaway || isButcher
        ? null
        : (extra.tableNumber !== undefined
          ? extra.tableNumber
          : (state.tableNumber != null ? state.tableNumber : fromSession.tableNumber)),
      lang: extra.lang || state.lang || fromSession.lang || null,
      sessionId: browseOnly ? null : (fromSession.sessionId || null),
      openedAt: browseOnly ? null : (fromSession.openedAt || null),
      status: browseOnly ? null : (fromSession.status || null),
      customerName: hasCustomer || isDineIn
        ? (extra.customerName ?? state.customerName ?? fromSession.customerName ?? '')
        : null,
      customerPhone: hasCustomer
        ? (extra.customerPhone ?? state.customerPhone ?? fromSession.customerPhone ?? '')
        : null,
      customerNotes: hasCustomer
        ? (extra.customerNotes ?? state.customerNotes ?? fromSession.customerNotes ?? '')
        : (orderType === 'dine-in'
          ? (extra.customerNotes ?? fromSession.customerNotes ?? '')
          : null),
      dineInNotesConfirmed: orderType === 'dine-in'
        ? Boolean(extra.dineInNotesConfirmed ?? fromSession.dineInNotesConfirmed)
        : false,
      placeReserved: orderType === 'dine-in'
        ? Boolean(extra.placeReserved ?? fromSession.placeReserved)
        : false,
      partySize: orderType === 'dine-in'
        ? (window.LechaimOrderSession?.normalizePartySize?.(
          extra.partySize !== undefined ? extra.partySize : fromSession.partySize
        ) ?? null)
        : null,
      customerAddress: isTakeaway
        ? (extra.customerAddress ?? state.customerAddress ?? fromSession.customerAddress ?? '')
        : null,
      fulfillmentType: isTakeaway
        ? (extra.fulfillmentType ?? state.fulfillmentType ?? fromSession.fulfillmentType ?? 'pickup')
        : null,
      deliveryFee: isTakeaway
        ? (extra.deliveryFee !== undefined
          ? extra.deliveryFee
          : (state.deliveryFee ?? fromSession.deliveryFee ?? null))
        : (isButcher ? (fromSession.deliveryFee ?? null) : null),
      pickupType: isTakeaway
        ? (extra.pickupType ?? state.pickupType ?? fromSession.pickupType ?? 'ASAP')
        : null,
      pickupTime: isTakeaway
        ? (extra.pickupTime ?? state.pickupTime ?? fromSession.pickupTime ?? null)
        : null,
      publicOrderNo: isTakeaway
        ? (extra.publicOrderNo ?? fromSession.publicOrderNo ?? null)
        : null,
    };
  }

  function enterMenu(context) {
    window.LechaimOrderContext = context;
    closeGate();

    if (!started) {
      started = true;
      if (typeof window.LechaimMenu?.start === 'function') {
        window.LechaimMenu.start(context);
      } else {
        console.error('[entry-gate] LechaimMenu.start is missing');
      }
      return;
    }

    if (typeof window.LechaimMenu?.updateOrderContext === 'function') {
      window.LechaimMenu.updateOrderContext(context);
    }
    if (!isStaffOrderPage() && typeof window.LechaimMenu?.maybeShowRecommendedToday === 'function') {
      window.LechaimMenu.maybeShowRecommendedToday();
    }
  }

  function setLang(lang) {
    if (lang !== 'he' && lang !== 'en') return;
    state.lang = lang;
    Session?.setLang?.(lang);
    applyEntryCopy();
    if (stepTable && !stepTable.hidden) {
      refreshOccupiedTables();
    }
  }

  function goToOrderType() {
    /* dine-in.html has no order-type chooser — always return to table modal */
    if (gate.dataset.mode === 'dine-in-only') {
      goToTable();
      return;
    }

    closeTableInfoModal();
    closeArriveModal();
    if (placeResThanks && !placeResThanks.hidden) {
      if (typeof placeResThanksTrapRelease === 'function') placeResThanksTrapRelease();
      placeResThanksTrapRelease = null;
      placeResThanks.hidden = true;
      placeResThanks.setAttribute('aria-hidden', 'true');
    }
    if (placeResCapacity && !placeResCapacity.hidden) {
      if (typeof placeResCapacityTrapRelease === 'function') placeResCapacityTrapRelease();
      placeResCapacityTrapRelease = null;
      placeResCapacity.hidden = true;
      placeResCapacity.setAttribute('aria-hidden', 'true');
    }
    setPlaceResModalOpen(false);
    state.orderType = null;
    state.tableNumber = null;
    state.customerName = '';
    state.customerPhone = '';
    state.customerNotes = '';
    state.customerAddress = '';
    state.fulfillmentType = 'pickup';
    state.pickupType = 'ASAP';
    state.pickupTime = null;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });
    if (tableBackBtn) tableBackBtn.dataset.entryBack = 'order';
    resetPickupForm();
    resetPlaceResForm();
    showStep(stepOrder);
  }

  function openTableInfoModal() {
    if (!tableModal) return;
    tableModal.hidden = false;
    tableModal.setAttribute('aria-hidden', 'false');
    if (typeof tableModalTrapRelease === 'function') tableModalTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(tableModal);
    tableModalTrapRelease = typeof release === 'function' ? release : null;
    requestAnimationFrame(() => tableModalPick?.focus());
  }

  function closeTableInfoModal() {
    if (!tableModal || tableModal.hidden) return;
    if (typeof tableModalTrapRelease === 'function') tableModalTrapRelease();
    tableModalTrapRelease = null;
    tableModal.hidden = true;
    tableModal.setAttribute('aria-hidden', 'true');
  }

  function openKosherCertificateLightbox() {
    if (!kosherLightbox) return;
    kosherLightboxLastFocus = document.activeElement;
    kosherLightbox.hidden = false;
    kosherLightbox.setAttribute('aria-hidden', 'false');
    if (typeof kosherLightboxTrapRelease === 'function') kosherLightboxTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(kosherLightbox);
    kosherLightboxTrapRelease = typeof release === 'function' ? release : null;
    requestAnimationFrame(() => kosherLightboxClose?.focus());
  }

  function closeKosherCertificateLightbox() {
    if (!kosherLightbox || kosherLightbox.hidden) return;
    if (typeof kosherLightboxTrapRelease === 'function') kosherLightboxTrapRelease();
    kosherLightboxTrapRelease = null;
    kosherLightbox.hidden = true;
    kosherLightbox.setAttribute('aria-hidden', 'true');
    if (kosherLightboxLastFocus && typeof kosherLightboxLastFocus.focus === 'function') {
      kosherLightboxLastFocus.focus();
    } else {
      kosherCertBtn?.focus();
    }
    kosherLightboxLastFocus = null;
  }

  async function goToTable() {
    state.orderType = 'dine-in';
    await refreshWeeklyHours();
    if (!isDineInOrderingOpen()) {
      showOrderingClosedStep('dine-in');
      return;
    }
    buildTables();
    highlightSelectedTable(state.tableNumber);
    if (tableBackBtn) tableBackBtn.dataset.entryBack = 'order';
    showStep(stepTable);
    refreshOccupiedTables();
    if (isStaffOrderPage()) startOccupiedRealtime();
    if (!isStaffOrderPage()) openTableInfoModal();
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Hebrew → Latin for thermal printers (readable names). */
  function transliterateToEnglish(raw) {
    const text = String(raw || '').normalize('NFKC').trim();
    if (!text) return '';
    if (!/[\u0590-\u05FF]/.test(text)) {
      return text.replace(/\s+/g, ' ').trim();
    }

    return text
      .split(/\s+/)
      .map((word) => titleCaseLatin(transliterateHebrewWord(word)))
      .filter(Boolean)
      .join(' ');
  }

  function titleCaseLatin(value) {
    const s = String(value || '').toLowerCase();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function transliterateHebrewWord(word) {
    const chars = [...String(word || '')];
    let out = '';
    let i = 0;

    while (i < chars.length) {
      const ch = chars[i];
      const next = chars[i + 1];

      if (ch === '\u05E9') { out += 'sh'; i += 1; continue; } // ש
      if (ch === '\u05D7') { out += 'ch'; i += 1; continue; } // ח
      if (ch === '\u05E6' || ch === '\u05E5') { out += 'tz'; i += 1; continue; } // צץ

      if (ch === '\u05D5') { // ו
        if (next === '\u05D0' || next === '\u05E2') { // וא / וע → ue (שמואל)
          out += 'ue';
          i += 2;
          continue;
        }
        if (next === '\u05D9') { // וי
          out += 'oi';
          i += 2;
          continue;
        }
        out += i === 0 ? 'v' : 'o';
        i += 1;
        continue;
      }

      if (ch === '\u05D9') { // י
        out += i === 0 ? 'y' : 'i';
        i += 1;
        continue;
      }

      if (ch === '\u05D0') { // א
        if (i === 0) out += 'a';
        i += 1;
        continue;
      }

      if (ch === '\u05D4') { // ה
        if (i !== chars.length - 1) out += 'h';
        i += 1;
        continue;
      }

      if (ch === '\u05E2') { // ע
        out += 'a';
        i += 1;
        continue;
      }

      if (ch === '\u05E4' || ch === '\u05E3') { // פ ף
        out += (ch === '\u05E3' || i === chars.length - 1) ? 'f' : 'p';
        i += 1;
        continue;
      }

      const simple = {
        '\u05D1': 'b', '\u05D2': 'g', '\u05D3': 'd', '\u05D6': 'z', '\u05D8': 't',
        '\u05DB': 'k', '\u05DA': 'k', '\u05DC': 'l', '\u05DE': 'm', '\u05DD': 'm',
        '\u05E0': 'n', '\u05DF': 'n', '\u05E1': 's', '\u05E7': 'k', '\u05E8': 'r',
        '\u05EA': 't',
      };
      if (simple[ch]) {
        out += simple[ch];
        i += 1;
        continue;
      }

      if (/[A-Za-z0-9]/.test(ch)) {
        out += ch;
      }
      i += 1;
    }

    return out.replace(/(.)\1+/g, '$1$1');
  }

  function isValidPhone(value) {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  function buildPickupSlots() {
    const slots = [];
    const openMinutes = typeof Hours()?.getOpenMinutes === 'function'
      ? Hours().getOpenMinutes()
      : (Hours()?.OPEN_HOUR ?? 14) * 60;
    const closeMinutes = typeof Hours()?.takeawaySlotCloseMinutes === 'function'
      ? Hours().takeawaySlotCloseMinutes()
      : (21 * 60 + 45);
    const now = new Date();
    let startMinutes = now.getHours() * 60 + now.getMinutes();
    startMinutes = Math.ceil((startMinutes + 1) / 15) * 15;

    let cursor = Math.max(startMinutes, openMinutes);
    if (cursor % 15 !== 0) cursor = Math.ceil(cursor / 15) * 15;

    /* If nothing left today, still offer the full service window */
    if (cursor > closeMinutes) {
      cursor = openMinutes;
    }

    for (let m = cursor; m <= closeMinutes; m += 15) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      if (hh > 23) break;
      slots.push(`${pad2(hh)}:${pad2(mm)}`);
    }
    return slots;
  }

  function fillPickupSlots() {
    if (!pickupSlot) return;
    const slots = buildPickupSlots();
    if (!slots.length) {
      pickupSlot.innerHTML = '<option value="">—</option>';
      return;
    }
    pickupSlot.innerHTML = slots.map((slot) => (
      `<option value="${slot}">${slot}</option>`
    )).join('');
  }

  function deliveriesOpen() {
    return !state.deliveriesClosed;
  }

  function getSelectedFulfillment() {
    if (!deliveriesOpen()) return 'pickup';
    return fulfillmentDelivery?.checked ? 'delivery' : 'pickup';
  }

  function syncFulfillmentUi() {
    const allowDelivery = deliveriesOpen();
    /* When deliveries closed: hide whole "סוג הזמנה" block + משלוח option */
    if (fulfillmentFieldset) fulfillmentFieldset.hidden = !allowDelivery;
    if (fulfillmentDeliveryRow) fulfillmentDeliveryRow.hidden = !allowDelivery;
    if (fulfillmentDelivery) fulfillmentDelivery.disabled = !allowDelivery;
    if (!allowDelivery && fulfillmentPickup) fulfillmentPickup.checked = true;

    const isDelivery = getSelectedFulfillment() === 'delivery';
    if (pickupAddressField) pickupAddressField.hidden = !isDelivery;
    if (pickupLocationField) pickupLocationField.hidden = !isDelivery;
    if (pickupAddress) {
      pickupAddress.required = isDelivery;
      if (!isDelivery) pickupAddress.value = '';
    }
    if (pickupLocation) {
      pickupLocation.required = isDelivery;
      if (!isDelivery) pickupLocation.value = '';
    }
    const timeLegend = pickupTimeFieldset?.querySelector('legend');
    if (timeLegend) timeLegend.textContent = isDelivery ? t('deliveryTime') : t('pickupTime');
    if (promptEl && stepPickup && !stepPickup.hidden) {
      promptEl.textContent = allowDelivery
        ? t('promptPickupWithDelivery')
        : t('promptPickup');
    }
  }

  function applyShabbatOrdersMode() {
    const open = state.shabbatOrdersEnabled !== false;
    if (shabbatLabelEl) {
      shabbatLabelEl.textContent = open ? t('shabbatOrders') : t('shabbatOrdersClosed');
    }
    if (shabbatHintEl) {
      shabbatHintEl.textContent = open ? t('shabbatOrdersHint') : t('shabbatOrdersClosedHint');
    }
    if (shabbatLinkEl) {
      shabbatLinkEl.classList.toggle('is-disabled', !open);
      shabbatLinkEl.setAttribute('aria-disabled', open ? 'false' : 'true');
      if (open) {
        shabbatLinkEl.setAttribute('href', 'shabbat.html');
        shabbatLinkEl.removeAttribute('tabindex');
      } else {
        shabbatLinkEl.setAttribute('href', '#');
        shabbatLinkEl.setAttribute('tabindex', '-1');
      }
    }
  }

  async function refreshShabbatOrdersEnabledFlag() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getShabbatOrdersEnabled !== 'function') {
      state.shabbatOrdersEnabled = true;
      applyShabbatOrdersMode();
      return;
    }
    try {
      state.shabbatOrdersEnabled = Boolean(await api.getShabbatOrdersEnabled());
    } catch (err) {
      console.warn('[entry-gate] shabbat orders flag load failed', err);
      state.shabbatOrdersEnabled = true;
    }
    applyShabbatOrdersMode();
  }

  function applyDeliveriesMode() {
    /* Pickup button stays pickup-only; delivery button is hidden when closed */
    if (takeAwayLabelEl) takeAwayLabelEl.textContent = t('takeAway');
    if (takeAwayHintEl) takeAwayHintEl.textContent = t('takeAwayHint');
    const deliveryHintEl = deliveryBtnEl?.querySelector('[data-entry-i18n="deliveryOrderHint"]');
    if (deliveryHintEl) deliveryHintEl.textContent = t('deliveryOrderHint');
    if (deliveryBtnEl) {
      deliveryBtnEl.hidden = Boolean(state.deliveriesClosed);
      deliveryBtnEl.setAttribute('aria-hidden', state.deliveriesClosed ? 'true' : 'false');
    }
    syncFulfillmentUi();
    if (promptEl && stepPickup && !stepPickup.hidden) {
      promptEl.textContent = t('promptPickup');
    }
  }

  async function refreshDeliveriesClosedFlag() {
    const api = window.LechaimSupabaseOrders;
    if (!api?.isConfigured?.() || typeof api.getDeliveriesClosed !== 'function') {
      state.deliveriesClosed = false;
      applyDeliveriesMode();
      return;
    }
    try {
      state.deliveriesClosed = Boolean(await api.getDeliveriesClosed());
    } catch (err) {
      console.warn('[entry-gate] deliveries flag load failed', err);
      state.deliveriesClosed = false;
    }
    applyDeliveriesMode();
  }

  async function refreshShopForceOpenFlag() {
    const api = window.LechaimSupabaseOrders;
    const hours = Hours();
    if (typeof hours?.isWithinOrderingHours !== 'function') return;
    if (!api?.isConfigured?.()) {
      applyShopHoursFromFlags(false, null, false, null);
      return;
    }
    try {
      const [openState, closeState] = await Promise.all([
        typeof api.getShopForceOpenState === 'function'
          ? api.getShopForceOpenState()
          : Promise.resolve({ active: false, flagText: null }),
        typeof api.getShopForceCloseState === 'function'
          ? api.getShopForceCloseState()
          : Promise.resolve({ active: false, flagText: null }),
      ]);
      applyShopHoursFromFlags(
        openState.active,
        openState.flagText,
        closeState.active,
        closeState.flagText
      );
    } catch (err) {
      console.warn('[entry-gate] shop hours load failed', err);
      applyShopHoursFromFlags(false, null, false, null);
    }
  }

  function applyShopHoursFromFlags(openValue, openText, closeValue, closeText) {
    const hours = Hours();
    hours?.applyForceOpenFromFlag?.(openValue, openText);
    hours?.applyForceCloseFromFlag?.(closeValue, closeText);
    routeShopHoursUi();
  }

  function routeShopHoursUi() {
    const open = Hours()?.isWithinOrderingHours?.() === true;
    if (open) {
      if (stepPickupClosed && !stepPickupClosed.hidden) {
        if (gate.dataset.mode === 'dine-in-only') goToTable();
        else goToOrderType();
      }
      return;
    }

    if (!document.body.classList.contains('entry-pending')) return;
    const onTable = stepTable && !stepTable.hidden;
    const onPickup = stepPickup && !stepPickup.hidden;
    if (gate.dataset.mode === 'dine-in-only' || onTable || state.orderType === 'dine-in') {
      if (!isDineInOrderingOpen()) showOrderingClosedStep('dine-in');
      return;
    }
    if (onPickup || state.orderType === 'takeaway') {
      if (!isTakeawayDayOpen()) showOrderingClosedStep('takeaway');
    }
  }

  function resetPickupForm() {
    if (pickupForm) pickupForm.reset();
    if (fulfillmentPickup) fulfillmentPickup.checked = true;
    if (pickupAsap) pickupAsap.checked = true;
    if (pickupSlot) {
      pickupSlot.hidden = true;
      pickupSlot.required = false;
    }
    if (pickupError) {
      pickupError.hidden = true;
      pickupError.textContent = '';
    }
    syncFulfillmentUi();
  }

  function syncPickupTimeUi() {
    const useTime = Boolean(pickupSelect?.checked);
    if (pickupSlot) {
      pickupSlot.hidden = !useTime;
      pickupSlot.required = useTime;
      if (useTime) fillPickupSlots();
    }
  }

  function showPickupError(message) {
    if (!pickupError) return;
    pickupError.hidden = false;
    pickupError.textContent = message;
  }

  async function goToPickup() {
    state.orderType = 'takeaway';
    state.tableNumber = null;
    await refreshWeeklyHours();
    if (!isTakeawayDayOpen()) {
      showOrderingClosedStep('takeaway');
      return;
    }
    /* Catalog first — name / phone / pickup collected at cart send (like butcher). */
    await refreshDeliveriesClosedFlag();
    finishTakeaway({ fulfillmentType: 'pickup' });
  }

  async function goToDelivery() {
    state.orderType = 'takeaway';
    state.tableNumber = null;
    await refreshWeeklyHours();
    await refreshDeliveriesClosedFlag();
    if (state.deliveriesClosed) {
      applyDeliveriesMode();
      return;
    }
    if (!isTakeawayDayOpen()) {
      showOrderingClosedStep('takeaway');
      return;
    }
    const fee = Number(window.LechaimAppSettings?.getDeliveryFee?.())
      || Number(window.TAKEAWAY_DEFAULT_DELIVERY_FEE)
      || Number(window.BUTCHER_DEFAULT_DELIVERY_FEE)
      || 10;
    finishTakeaway({ fulfillmentType: 'delivery', deliveryFee: fee });
  }

  function dineInArrivalPayload(details = {}) {
    const placeReserved = details.placeReserved === true;
    const customerName = placeReserved ? String(details.customerName || '').trim() : '';
    const partySize = placeReserved
      ? (window.LechaimOrderSession?.normalizePartySize?.(details.partySize) ?? null)
      : null;
    const compose = window.LechaimOrderSession?.composeDineInNotes;
    const customerNotes = typeof compose === 'function'
      ? compose({ placeReserved, partySize, userNotes: '' })
      : '';
    return { placeReserved, customerName, partySize, customerNotes };
  }

  function completeDineInTable(table, details = {}) {
    const n = Number(table);
    if (!Number.isInteger(n) || n < TABLE_MIN || n > TABLE_MAX) return;
    if (isStaffOrderPage()) {
      try { localStorage.removeItem('lechaim-keri-cart'); } catch (_) { /* ignore */ }
    }
    state.orderType = 'dine-in';
    state.tableNumber = table;
    highlightSelectedTable(table);

    const prev = Session?.getSession?.();
    const keepArrival = Boolean(
      (changingTable || Session?.hasActiveDineInSession?.())
      && prev
      && (prev.orderType === 'dine-in' || prev.orderType === 'dinein')
    );
    const arrival = keepArrival
      ? {
        placeReserved: prev.placeReserved === true
          || Boolean(String(prev.customerName || '').trim()),
        customerName: String(prev.customerName || '').trim(),
        partySize: prev.partySize != null ? prev.partySize : null,
        customerNotes: prev.customerNotes || '',
      }
      : dineInArrivalPayload(details);

    state.customerName = arrival.customerName;

    if (Session) {
      if (prev?.sessionId && Number(prev.tableNumber) !== Number(table)) {
        clearLocalSessionMapEntry(prev.sessionId);
      }
      const opts = {
        lang: state.lang,
        customerName: arrival.customerName,
        customerNotes: arrival.customerNotes,
        placeReserved: arrival.placeReserved,
        partySize: arrival.partySize,
      };
      if (changingTable || Session.hasActiveDineInSession()) {
        Session.updateTable(table, opts);
      } else {
        Session.startDineIn(table, opts);
      }
    }

    enterMenu(buildMenuContext({
      orderType: 'dine-in',
      tableNumber: table,
      lang: state.lang,
      customerName: arrival.customerName,
      customerNotes: arrival.customerNotes,
      placeReserved: arrival.placeReserved,
      partySize: arrival.partySize,
    }));
    if (isStaffOrderPage()) {
      void window.LechaimStaffOrder?.attachToTable?.(table);
    }
  }

  function setArriveStep(step) {
    if (!arriveModal) return;
    arriveModal.querySelectorAll('[data-arrive-step]').forEach((el) => {
      el.hidden = el.getAttribute('data-arrive-step') !== step;
    });
    if (arriveError) {
      arriveError.hidden = true;
      arriveError.textContent = '';
    }
    const focusEl = step === 'yes'
      ? arriveName
      : step === 'no'
        ? arriveWelcomeContinue
        : arriveYesBtn;
    window.setTimeout(() => focusEl?.focus(), 0);
  }

  function openArriveModal(table) {
    pendingArriveTable = table;
    if (!arriveModal) {
      completeDineInTable(table, { placeReserved: false });
      return;
    }
    if (arriveName) arriveName.value = '';
    if (arriveParty) arriveParty.value = '';
    setArriveStep('ask');
    mountPlaceResOverlay(arriveModal);
    setPlaceResModalOpen(true);
    arriveModal.hidden = false;
    arriveModal.setAttribute('aria-hidden', 'false');
    if (typeof arriveTrapRelease === 'function') arriveTrapRelease();
    const release = window.LechaimFocusTrap?.activate?.(arriveModal);
    arriveTrapRelease = typeof release === 'function' ? release : null;
    arriveYesBtn?.focus();
  }

  function submitArriveYes() {
    const table = pendingArriveTable;
    const name = String(arriveName?.value || '').trim();
    const partySize = window.LechaimOrderSession?.normalizePartySize?.(arriveParty?.value);
    if (!name) {
      if (arriveError) {
        arriveError.textContent = t('arriveNameRequired');
        arriveError.hidden = false;
      }
      arriveName?.focus();
      return;
    }
    if (partySize == null) {
      if (arriveError) {
        arriveError.textContent = t('arrivePartyRequired');
        arriveError.hidden = false;
      }
      arriveParty?.focus();
      return;
    }
    pendingArriveTable = null;
    markTodayReservationArrived(name, partySize);
    completeDineInTable(table, {
      placeReserved: true,
      customerName: name,
      partySize,
    });
  }

  function markTodayReservationArrived(name, partySize) {
    const api = window.LechaimPlaceReservations;
    if (typeof api?.markArrivedByName !== 'function') return;
    api.markArrivedByName({ customerName: name, partySize }).catch((err) => {
      console.warn('[entry-gate] mark reservation arrived failed', err);
    });
  }

  function finishWithTable(table) {
    if (isStaffOrderPage() || changingTable || Session?.hasActiveDineInSession()) {
      completeDineInTable(table);
      return;
    }
    openArriveModal(table);
  }

  function finishTakeaway(details = {}) {
    state.orderType = 'takeaway';
    state.tableNumber = null;
    state.customerName = details.customerName || '';
    state.customerPhone = details.customerPhone || '';
    state.customerNotes = details.customerNotes || '';
    state.fulfillmentType = details.fulfillmentType === 'delivery' ? 'delivery' : 'pickup';
    state.customerAddress = state.fulfillmentType === 'delivery'
      ? (details.customerAddress || '')
      : '';
    const feeRaw = Number(details.deliveryFee);
    state.deliveryFee = state.fulfillmentType === 'delivery'
      ? (Number.isFinite(feeRaw) && feeRaw >= 0
        ? feeRaw
        : (Number(window.LechaimAppSettings?.getDeliveryFee?.())
          || Number(window.TAKEAWAY_DEFAULT_DELIVERY_FEE)
          || Number(window.BUTCHER_DEFAULT_DELIVERY_FEE)
          || 10))
      : null;
    state.pickupType = details.pickupType === 'TIME' ? 'TIME' : (details.pickupType === 'ASAP' ? 'ASAP' : null);
    state.pickupTime = state.pickupType === 'TIME' ? (details.pickupTime || null) : null;
    state.pickupDate = state.pickupType === 'TIME' ? (details.pickupDate || null) : null;
    changingTable = false;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });

    /* Replacing local takeaway session — clear all pickup/delivery locks on this phone. */
    clearTakeawayLockStorage();
    try {
      window.LechaimOrderEngine?.closeTakeaway?.();
    } catch (err) {
      console.warn('[entry-gate] close previous takeaway failed', err);
    }
    clearPersistedCartStorage('takeaway', state.fulfillmentType);

    if (Session) {
      Session.startTakeaway({
        lang: state.lang,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        customerNotes: state.customerNotes,
        customerAddress: state.customerAddress,
        fulfillmentType: state.fulfillmentType,
        deliveryFee: state.deliveryFee,
        pickupType: state.pickupType || 'ASAP',
        pickupTime: state.pickupTime,
        pickupDate: state.pickupDate,
      });
    }

    enterMenu(buildMenuContext({
      orderType: 'takeaway',
      tableNumber: null,
      lang: state.lang,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      customerNotes: state.customerNotes,
      customerAddress: state.customerAddress,
      fulfillmentType: state.fulfillmentType,
      deliveryFee: state.deliveryFee,
      pickupType: state.pickupType || 'ASAP',
      pickupTime: state.pickupTime,
      pickupDate: state.pickupDate,
      publicOrderNo: null,
    }));
  }

  /** Open butcher catalog immediately — name/phone collected at cart send. */
  function finishButcher(details = {}) {
    state.orderType = 'butcher';
    state.tableNumber = null;
    state.customerName = details.customerName || '';
    state.customerPhone = details.customerPhone || '';
    state.customerNotes = details.customerNotes || '';
    state.pickupType = null;
    state.pickupTime = null;
    changingTable = false;

    if (Session?.startButcher) {
      Session.startButcher({
        lang: state.lang,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        customerNotes: state.customerNotes,
      });
    }

    enterMenu(buildMenuContext({
      orderType: 'butcher',
      tableNumber: null,
      lang: state.lang,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      customerNotes: state.customerNotes,
    }));
  }

  function goToButcher() {
    finishButcher({});
  }

  function submitPickupForm(event) {
    event?.preventDefault?.();
    if (!isTakeawayDayOpen()) {
      goToPickup();
      return;
    }
    const nameRaw = String(pickupName?.value || '').trim();
    const phone = String(pickupPhone?.value || '').trim();
    const notes = String(pickupNotes?.value || '').trim();
    const fulfillmentType = getSelectedFulfillment();
    const address = String(pickupAddress?.value || '').trim();
    const locationUrl = window.LechaimOrderSession?.normalizeLocationUrl?.(pickupLocation?.value)
      || '';
    const pickupType = pickupSelect?.checked ? 'TIME' : 'ASAP';
    const pickupTime = pickupType === 'TIME' ? String(pickupSlot?.value || '').trim() : null;
    const nameEn = transliterateToEnglish(nameRaw);

    if (!nameRaw || !nameEn) {
      showPickupError(t('pickupNameRequired'));
      pickupName?.focus();
      return;
    }
    if (fulfillmentType === 'delivery' && !address) {
      showPickupError(t('pickupAddressRequired'));
      pickupAddress?.focus();
      return;
    }
    if (fulfillmentType === 'delivery' && String(pickupLocation?.value || '').trim() && !locationUrl) {
      showPickupError(t('pickupLocationInvalid'));
      pickupLocation?.focus();
      return;
    }
    if (!phone) {
      showPickupError(t('pickupPhoneRequired'));
      pickupPhone?.focus();
      return;
    }
    if (!isValidPhone(phone)) {
      showPickupError(t('pickupPhoneInvalid'));
      pickupPhone?.focus();
      return;
    }
    if (pickupType === 'TIME' && !pickupTime) {
      showPickupError(t('pickupTimeRequired'));
      pickupSlot?.focus();
      return;
    }

    if (pickupError) {
      pickupError.hidden = true;
      pickupError.textContent = '';
    }

    finishTakeaway({
      customerName: nameEn,
      customerPhone: phone,
      customerNotes: notes,
      customerAddress: fulfillmentType === 'delivery'
        ? (window.LechaimOrderSession?.composeCustomerAddress?.(address, locationUrl) || address)
        : '',
      fulfillmentType,
      pickupType,
      pickupTime,
    });
  }

  function reopenTablePicker() {
    const order = window.LechaimOrderEngine?.getOrder?.();
    const locked = Boolean(order?.items?.some((item) => item && Number(item.qty) > 0));
    if (locked) {
      if (typeof window.LechaimMenu?.notifyTableLocked === 'function') {
        window.LechaimMenu.notifyTableLocked();
      }
      return false;
    }

    const ctx = window.LechaimOrderContext || Session?.toMenuContext?.() || {};
    if (ctx.orderType !== 'dine-in') return false;

    changingTable = true;
    started = true;
    state.orderType = 'dine-in';
    state.lang = ctx.lang || state.lang || 'he';
    state.tableNumber = ctx.tableNumber != null ? Number(ctx.tableNumber) : null;

    openGate();
    goToTable();
    return true;
  }

  function reopenOrderTypePicker() {
    const ctx = window.LechaimOrderContext || Session?.toMenuContext?.() || {};

    /* dine-in.html: back from browse (or any non-table session) → table map, not order-type home */
    if (gate.dataset.mode === 'dine-in-only') {
      if (ctx.browseOnly || ctx.orderType !== 'dine-in') {
        changingTable = false;
        started = true;
        state.lang = ctx.lang || state.lang || 'he';
        state.orderType = null;
        state.tableNumber = null;
        setLang(state.lang);
        openGate();
        goToTable();
        return true;
      }
      return reopenTablePicker();
    }

    started = true;
    changingTable = false;
    state.lang = ctx.lang || state.lang || 'he';
    state.orderType = null;
    state.tableNumber = null;

    setLang(state.lang);
    openGate();
    goToOrderType();
    return true;
  }

  /**
   * Called by the customer app when Supabase marks the session closed.
   * Does not clear storage itself — main.js clears local state first.
   */
  function resetToEntry() {
    started = true;
    changingTable = false;
    state.orderType = null;
    state.tableNumber = null;
    state.customerName = '';
    state.customerPhone = '';
    state.customerNotes = '';
    state.customerAddress = '';
    state.fulfillmentType = 'pickup';
    state.pickupType = 'ASAP';
    state.pickupTime = null;
    tablesEl?.querySelectorAll('.entry-gate__table').forEach((btn) => {
      btn.classList.remove('is-selected');
    });
    setLang(state.lang || 'he');
    openGate();
    if (gate.dataset.mode === 'dine-in-only') {
      goToTable();
      return;
    }
    goToOrderType();
  }

  function clearLocalSessionMapEntry(localSessionId) {
    if (!localSessionId) return;
    try {
      const raw = localStorage.getItem('lechaim-supabase-session-map');
      const map = raw ? JSON.parse(raw) : {};
      if (!map || typeof map !== 'object') return;
      delete map[String(localSessionId)];
      localStorage.setItem('lechaim-supabase-session-map', JSON.stringify(map));
    } catch (err) {
      console.warn('[entry-gate] session map clear failed', err);
    }
  }

  async function isMappedRemoteSessionClosed(localSessionId) {
    const api = window.LechaimSupabaseOrders;
    if (!localSessionId || !api?.isConfigured?.() || typeof api.getSession !== 'function') {
      return false;
    }

    let remoteId = null;
    try {
      const raw = localStorage.getItem('lechaim-supabase-session-map');
      const map = raw ? JSON.parse(raw) : {};
      remoteId = map?.[String(localSessionId)] || null;
    } catch (_) {
      return false;
    }
    if (!remoteId) return false;

    try {
      const remote = await api.getSession(remoteId);
      return Boolean(remote && remote.status === 'closed');
    } catch (err) {
      console.warn('[entry-gate] getSession failed', err);
      return false;
    }
  }

  function cartStorageKeyForOrderType(orderType, fulfillmentType) {
    if (isButcherSessionType(orderType)) return 'lechaim-cart-butcher';
    if (isTakeawaySessionType(orderType)) {
      return String(fulfillmentType || '') === 'delivery'
        ? 'lechaim-cart-delivery'
        : 'lechaim-cart-pickup';
    }
    return 'lechaim-keri-cart';
  }

  function clearPersistedCartStorage(orderType, fulfillmentType) {
    try {
      const key = cartStorageKeyForOrderType(orderType, fulfillmentType);
      localStorage.setItem(key, JSON.stringify({ lines: [], order: [] }));
    } catch (_) { /* ignore */ }
  }

  function isButcherSessionType(orderType) {
    const raw = String(orderType || '').toLowerCase();
    return raw === 'butcher' || raw.includes('butcher');
  }

  function isTakeawaySessionType(orderType) {
    const raw = String(orderType || '').toLowerCase();
    return raw === 'takeaway' || raw === 'take-away' || raw.includes('take');
  }

  function sessionFulfillmentType(session) {
    return String(session?.fulfillmentType || '') === 'delivery' ? 'delivery' : 'pickup';
  }

  function takeawayLockKeys(fulfillmentType) {
    if (fulfillmentType === 'delivery') {
      return ['lechaim-takeaway-order-lock-delivery', 'lechaim-takeaway-order-lock'];
    }
    if (fulfillmentType === 'pickup') {
      return ['lechaim-takeaway-order-lock-pickup', 'lechaim-takeaway-order-lock'];
    }
    return [
      'lechaim-takeaway-order-lock-pickup',
      'lechaim-takeaway-order-lock-delivery',
      'lechaim-takeaway-order-lock',
    ];
  }

  function clearTakeawayLockStorage(fulfillmentType) {
    takeawayLockKeys(fulfillmentType).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (_) { /* ignore */ }
    });
  }

  async function discardClosedLocalSession(session) {
    if (!session) return;
    clearLocalSessionMapEntry(session.sessionId);
    try {
      Session?.clearSession?.();
    } catch (err) {
      console.warn('[entry-gate] clearSession failed', err);
    }
    try {
      if (session.tableNumber != null && window.LechaimOrderEngine?.closeTable) {
        window.LechaimOrderEngine.closeTable(session.tableNumber);
      } else if (isTakeawaySessionType(session.orderType)) {
        clearTakeawayLockStorage(sessionFulfillmentType(session));
        window.LechaimOrderEngine?.closeTakeaway?.()
          || window.LechaimOrderEngine?.clearOrder?.();
      } else if (isButcherSessionType(session.orderType)) {
        window.LechaimOrderEngine?.clearOrder?.();
      }
    } catch (err) {
      console.warn('[entry-gate] local order clear failed', err);
    }
    clearPersistedCartStorage(session.orderType, sessionFulfillmentType(session));
  }

  async function resumeTakeawaySession(session) {
    if (!session) return false;

    if (await isMappedRemoteSessionClosed(session.sessionId)) {
      console.log('[entry-gate] takeaway Supabase session closed — not resuming');
      await discardClosedLocalSession(session);
      clearTakeawayLockStorage();
      return false;
    }

    state.orderType = 'takeaway';
    state.tableNumber = null;
    state.customerName = session.customerName || '';
    state.customerPhone = session.customerPhone || '';
    state.customerNotes = session.customerNotes || '';
    state.fulfillmentType = sessionFulfillmentType(session);
    state.customerAddress = state.fulfillmentType === 'delivery'
      ? (session.customerAddress || '')
      : '';
    state.deliveryFee = state.fulfillmentType === 'delivery'
      ? (session.deliveryFee != null
        ? Number(session.deliveryFee)
        : (Number(window.LechaimAppSettings?.getDeliveryFee?.())
          || Number(window.TAKEAWAY_DEFAULT_DELIVERY_FEE)
          || 10))
      : null;
    state.pickupType = session.pickupType === 'TIME' ? 'TIME' : 'ASAP';
    state.pickupTime = state.pickupType === 'TIME' ? (session.pickupTime || null) : null;
    state.pickupDate = state.pickupType === 'TIME' ? (session.pickupDate || null) : null;
    if (session.lang === 'he' || session.lang === 'en') {
      state.lang = session.lang;
    }

    setLang(state.lang);
    Session?.setLang?.(state.lang);
    enterMenu(buildMenuContext({
      orderType: 'takeaway',
      tableNumber: null,
      lang: state.lang,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      customerNotes: state.customerNotes,
      customerAddress: state.customerAddress,
      fulfillmentType: state.fulfillmentType,
      deliveryFee: state.deliveryFee,
      pickupType: state.pickupType,
      pickupTime: state.pickupTime,
      pickupDate: state.pickupDate,
      publicOrderNo: session.publicOrderNo != null ? Number(session.publicOrderNo) : null,
    }));
    return true;
  }

  /** Persisted cart qty for the given session family (pickup / delivery / butcher / dine-in). */
  function readPersistedCartCount(orderType, fulfillmentType) {
    try {
      const raw = localStorage.getItem(cartStorageKeyForOrderType(orderType, fulfillmentType));
      const parsed = raw ? JSON.parse(raw) : null;
      const lines = Array.isArray(parsed) ? parsed : (parsed?.lines || []);
      return lines.reduce((sum, line) => sum + (Number(line?.qty) || 0), 0);
    } catch {
      return 0;
    }
  }

  function hasTakeawayOrderLock(fulfillmentType) {
    return takeawayLockKeys(fulfillmentType).some((key) => {
      try {
        const raw = localStorage.getItem(key);
        const lock = raw ? JSON.parse(raw) : null;
        return Boolean(lock && lock.sessionId);
      } catch {
        return false;
      }
    });
  }

  function hasEngineOrderItemsForSession(session) {
    if (!session) return false;
    try {
      const raw = localStorage.getItem('lechaim-open-orders');
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return false;
      const sid = session.sessionId != null ? String(session.sessionId) : '';
      const table = session.tableNumber != null ? Number(session.tableNumber) : null;
      const takeaway = isTakeawaySessionType(session.orderType);
      const butcher = isButcherSessionType(session.orderType);
      return list.some((order) => {
        if (!order?.items?.some((item) => item && Number(item.qty) > 0)) return false;
        if (sid && String(order.sessionId || '') === sid) return true;
        if (table != null && Number(order.tableNumber) === table) return true;
        const ot = String(order.orderType || '').toLowerCase();
        if (takeaway && (ot === 'takeaway' || ot === 'take-away')) return true;
        if (butcher && ot.includes('butcher')) return true;
        return false;
      });
    } catch {
      return false;
    }
  }

  /**
   * Resume only when the customer still has cart items, a sent/locked order,
   * or engine items. Empty cart + no active order → back to first entry buttons.
   */
  function shouldKeepSessionOnRefresh(session) {
    const fulfillment = sessionFulfillmentType(session);
    if (readPersistedCartCount(session?.orderType, fulfillment) > 0) return true;
    if (isTakeawaySessionType(session?.orderType) && hasTakeawayOrderLock(fulfillment)) return true;
    if (hasEngineOrderItemsForSession(session)) return true;
    return false;
  }

  async function discardIdleSession(session) {
    if (!session) return;
    clearLocalSessionMapEntry(session.sessionId);
    try {
      Session?.clearSession?.();
    } catch (err) {
      console.warn('[entry-gate] clear idle session failed', err);
    }
    try {
      if (isTakeawaySessionType(session.orderType)) {
        clearTakeawayLockStorage(sessionFulfillmentType(session));
        window.LechaimOrderEngine?.closeTakeaway?.();
      } else if (isButcherSessionType(session.orderType)) {
        window.LechaimOrderEngine?.clearOrder?.();
      } else if (session.tableNumber != null) {
        window.LechaimOrderEngine?.closeTable?.(session.tableNumber);
      }
    } catch (err) {
      console.warn('[entry-gate] idle local order clear failed', err);
    }
    clearPersistedCartStorage(session.orderType, sessionFulfillmentType(session));
  }

  async function resumeButcherSession(session) {
    if (!session) return false;

    if (await isMappedRemoteSessionClosed(session.sessionId)) {
      console.log('[entry-gate] butcher Supabase session closed — not resuming');
      await discardClosedLocalSession(session);
      return false;
    }

    if (!shouldKeepSessionOnRefresh(session)) {
      console.log('[entry-gate] empty butcher cart — return to entry');
      await discardIdleSession(session);
      return false;
    }

    state.orderType = 'butcher';
    state.tableNumber = null;
    state.customerName = session.customerName || '';
    state.customerPhone = session.customerPhone || '';
    state.customerNotes = session.customerNotes || '';
    state.pickupType = null;
    state.pickupTime = null;
    if (session.lang === 'he' || session.lang === 'en') {
      state.lang = session.lang;
    }

    setLang(state.lang);
    Session?.setLang?.(state.lang);
    enterMenu(buildMenuContext({
      orderType: 'butcher',
      tableNumber: null,
      lang: state.lang,
      customerName: state.customerName,
      customerPhone: state.customerPhone,
      customerNotes: state.customerNotes,
    }));
    return true;
  }

  /**
   * Resume an open dine-in or butcher session into the menu (unless Supabase says closed).
   * Takeaway: never auto-enter the menu on refresh — show home and keep order state.
   * User resumes via the איסוף עצמי button → resumeTakeawaySession.
   */
  async function tryResumeSession() {
    if (Session?.hasActiveDineInSession()) {
      const session = Session.getSession();
      if (!session) return false;

      if (await isMappedRemoteSessionClosed(session.sessionId)) {
        console.log('[entry-gate] mapped Supabase session is closed — not resuming');
        await discardClosedLocalSession(session);
        return false;
      }

      if (!shouldKeepSessionOnRefresh(session)) {
        console.log('[entry-gate] empty cart — return to entry buttons');
        await discardIdleSession(session);
        return false;
      }

      if (!isDineInOrderingOpen()) return false;

      state.orderType = 'dine-in';
      state.tableNumber = session.tableNumber;
      if (session.lang === 'he' || session.lang === 'en') {
        state.lang = session.lang;
      }

      setLang(state.lang);
      enterMenu(buildMenuContext({
        orderType: 'dine-in',
        tableNumber: session.tableNumber,
        lang: state.lang,
      }));
      return true;
    }

    if (Session?.hasActiveTakeawaySession()) {
      const session = Session.getSession();
      if (session && await isMappedRemoteSessionClosed(session.sessionId)) {
        console.log('[entry-gate] takeaway Supabase session closed — clearing local, showing home');
        await discardClosedLocalSession(session);
        clearTakeawayLockStorage();
        return false;
      }
      /* Keep lechaim-order-session / cart / lock. Navigation only → home. */
      console.log('[entry-gate] takeaway session kept — showing home (no auto-resume on refresh)');
      return false;
    }

    if (Session?.hasActiveButcherSession?.()) {
      const session = Session.getSession();
      if (!session) return false;
      if (await isMappedRemoteSessionClosed(session.sessionId)) {
        await discardClosedLocalSession(session);
        return false;
      }
      if (!shouldKeepSessionOnRefresh(session)) {
        console.log('[entry-gate] empty butcher cart — return to entry buttons');
        await discardIdleSession(session);
        return false;
      }
      return resumeButcherSession(session);
    }

    return false;
  }

  langToggle?.addEventListener('click', (event) => {
    const picked = event.target.closest('[data-lang]')?.dataset.lang;
    const next = picked === 'he' || picked === 'en'
      ? picked
      : (state.lang === 'he' ? 'en' : 'he');
    setLang(next);
  });

  shabbatLinkEl?.addEventListener('click', (event) => {
    if (state.shabbatOrdersEnabled === false) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  gate.addEventListener('click', (event) => {
    if (event.target.closest('#entry-lang-toggle')) return;

    const placeResBtn = event.target.closest('[data-entry-action="place-reservation"]');
    if (placeResBtn) {
      goToPlaceReservation();
      return;
    }

    const orderBtn = event.target.closest('[data-order-type]');
    if (orderBtn) {
      const type = orderBtn.dataset.orderType;
      if (type === 'browse') {
        enterBrowseOnly();
        return;
      }
      if (type === 'dine-in') {
        state.orderType = 'dine-in';
        if (!isDineInOrderingOpen()) {
          showOrderingClosedStep('dine-in');
          return;
        }
        /* Existing active table → skip picker and resume (unless remote closed) */
        if (!changingTable && Session?.hasActiveDineInSession()) {
          const session = Session.getSession();
          (async () => {
            if (await isMappedRemoteSessionClosed(session?.sessionId)) {
              console.log('[entry-gate] mapped Supabase session is closed — show table picker');
              await discardClosedLocalSession(session);
              goToTable();
              return;
            }
            state.tableNumber = session.tableNumber;
            Session.setLang?.(state.lang);
            enterMenu(buildMenuContext({
              orderType: 'dine-in',
              tableNumber: session.tableNumber,
              lang: state.lang,
            }));
          })();
          return;
        }
        goToTable();
        return;
      }
      if (type === 'takeaway') {
        state.orderType = 'takeaway';
        if (!isTakeawayDayOpen()) {
          showOrderingClosedStep('takeaway');
          return;
        }
        /* Resume only a matching pickup session — delivery stays separate. */
        if (Session?.hasActiveTakeawaySession()) {
          (async () => {
            const session = Session.getSession();
            if (sessionFulfillmentType(session) === 'pickup') {
              const resumed = await resumeTakeawaySession(session);
              if (!resumed) goToPickup();
              return;
            }
            goToPickup();
          })();
          return;
        }
        goToPickup();
        return;
      }
      if (type === 'delivery') {
        state.orderType = 'takeaway';
        if (!isTakeawayDayOpen()) {
          showOrderingClosedStep('takeaway');
          return;
        }
        /* Resume only a matching delivery session — pickup stays separate. */
        if (Session?.hasActiveTakeawaySession()) {
          (async () => {
            const session = Session.getSession();
            if (sessionFulfillmentType(session) === 'delivery') {
              const resumed = await resumeTakeawaySession(session);
              if (!resumed) goToDelivery();
              return;
            }
            goToDelivery();
          })();
          return;
        }
        goToDelivery();
        return;
      }
      if (type === 'butcher') {
        state.orderType = 'butcher';
        if (Session?.hasActiveButcherSession?.()) {
          void (async () => {
            const resumed = await resumeButcherSession(Session.getSession());
            if (!resumed) goToButcher();
          })();
          return;
        }
        goToButcher();
        return;
      }
      return;
    }

    const tableBtn = event.target.closest('[data-table]');
    if (tableBtn && stepTable && !stepTable.hidden) {
      const occupiedBlocked = tableBtn.disabled
        || (tableBtn.classList.contains('is-occupied') && !isStaffOrderPage());
      if (occupiedBlocked) {
        showNotice(t('tableOccupied'));
        return;
      }
      const table = Number(tableBtn.dataset.table);
      if (!Number.isInteger(table) || table < TABLE_MIN || table > TABLE_MAX) return;
      finishWithTable(table);
      return;
    }

    const backBtn = event.target.closest('[data-entry-back]');
    if (backBtn) goToOrderType();
  });

  pickupForm?.addEventListener('submit', submitPickupForm);
  fulfillmentPickup?.addEventListener('change', syncFulfillmentUi);
  fulfillmentDelivery?.addEventListener('change', syncFulfillmentUi);
  pickupAsap?.addEventListener('change', syncPickupTimeUi);
  pickupSelect?.addEventListener('change', syncPickupTimeUi);
  pickupClosedBrowse?.addEventListener('click', () => {
    enterBrowseOnly();
  });
  placeResForm?.addEventListener('submit', submitPlaceResForm);
  placeResNotesToggle?.addEventListener('click', () => {
    if (placeResNotesField) placeResNotesField.hidden = false;
    if (placeResNotesToggle) placeResNotesToggle.hidden = true;
    placeResNotes?.focus();
  });
  placeResDate?.addEventListener('change', () => {
    refreshPlaceResAvailableSlots();
  });
  placeResParty?.addEventListener('input', () => {
    refreshPlaceResAvailableSlots();
  });
  placeResParty?.addEventListener('change', () => {
    refreshPlaceResAvailableSlots();
  });
  placeResTime?.addEventListener('focus', () => {
    refreshPlaceResAvailableSlots();
  });
  placeResTime?.addEventListener('mousedown', () => {
    refreshPlaceResAvailableSlots();
  });
  placeResThanksClose?.addEventListener('click', closePlaceResThanks);
  placeResThanksBackdrop?.addEventListener('click', closePlaceResThanks);
  placeResCapacityClose?.addEventListener('click', closePlaceResCapacity);
  placeResCapacityBackdrop?.addEventListener('click', closePlaceResCapacity);
  arriveYesBtn?.addEventListener('click', () => setArriveStep('yes'));
  arriveNoBtn?.addEventListener('click', () => setArriveStep('no'));
  arriveYesBack?.addEventListener('click', () => setArriveStep('ask'));
  arriveWelcomeContinue?.addEventListener('click', () => {
    const table = pendingArriveTable;
    pendingArriveTable = null;
    completeDineInTable(table, { placeReserved: false });
  });
  arriveForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitArriveYes();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (arriveModal && !arriveModal.hidden) {
      event.preventDefault();
      const yesStep = arriveModal.querySelector('[data-arrive-step="yes"]');
      const noStep = arriveModal.querySelector('[data-arrive-step="no"]');
      if ((yesStep && !yesStep.hidden) || (noStep && !noStep.hidden)) {
        setArriveStep('ask');
      }
      return;
    }
    if (placeResCapacity && !placeResCapacity.hidden) {
      closePlaceResCapacity();
      return;
    }
    if (placeResThanks && !placeResThanks.hidden) {
      closePlaceResThanks();
    }
  });
  tableModalPick?.addEventListener('click', closeTableInfoModal);
  tableModalBrowse?.addEventListener('click', () => {
    closeTableInfoModal();
    enterBrowseOnly();
  });
  tableModalBackdrop?.addEventListener('click', closeTableInfoModal);

  kosherCertBtn?.addEventListener('click', openKosherCertificateLightbox);
  kosherLightboxClose?.addEventListener('click', closeKosherCertificateLightbox);
  kosherLightboxBackdrop?.addEventListener('click', closeKosherCertificateLightbox);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (kosherLightbox && !kosherLightbox.hidden) {
      event.preventDefault();
      closeKosherCertificateLightbox();
    }
  });

  window.LechaimEntryGate = {
    reopenTablePicker,
    reopenOrderTypePicker,
    resetToEntry,
    refreshOccupiedTables,
    /** Used by dine-in floor-plan map — same path as tapping a table button */
    selectDineInTable: finishWithTable,
    transliterateToEnglish,
    isValidPhone,
    areDeliveriesOpen: deliveriesOpen,
    refreshDeliveriesClosedFlag,
  };

  document.body.classList.add('entry-pending');
  gate.hidden = false;
  gate.setAttribute('aria-hidden', 'false');
  activateGateFocusTrap();

  async function bootRestaurantFlags() {
    if (typeof window.LechaimAppSettings?.load === 'function') {
      try { await window.LechaimAppSettings.load(); } catch (_) { /* keep fallbacks */ }
    }
    await refreshDeliveriesClosedFlag();
    await refreshShabbatOrdersEnabledFlag();
    await refreshShopForceOpenFlag();
    const api = window.LechaimSupabaseOrders;
    if (api?.subscribeRestaurantFlags) {
      api.subscribeRestaurantFlags((evt) => {
        if (evt?.flagKey === 'deliveries_closed') {
          state.deliveriesClosed = Boolean(evt.flagValue);
          applyDeliveriesMode();
          return;
        }
        if (evt?.flagKey === 'shabbat_orders_enabled') {
          state.shabbatOrdersEnabled = Boolean(evt.flagValue);
          applyShabbatOrdersMode();
          return;
        }
        if (evt?.flagKey === 'shop_force_open') {
          Hours()?.applyForceOpenFromFlag?.(evt.flagValue, evt.flagText);
          routeShopHoursUi();
          return;
        }
        if (evt?.flagKey === 'shop_force_close') {
          Hours()?.applyForceCloseFromFlag?.(evt.flagValue, evt.flagText);
          routeShopHoursUi();
        }
      });
    }
    Hours()?.onScheduleChange?.(() => {
      routeShopHoursUi();
      applyEntryCopy();
      applyClosedDayOnHome();
    });
    window.LechaimAppSettings?.onChange?.(() => {
      applyEntryCopy();
      applyDeliveriesMode();
      applyClosedDayOnHome();
    });
    Hours()?.onForceOpenExpired?.(() => {
      Hours()?.applyForceOpenFromFlag?.(false, null);
      routeShopHoursUi();
    });
    Hours()?.onForceCloseExpired?.(() => {
      Hours()?.applyForceCloseFromFlag?.(false, null);
      routeShopHoursUi();
    });
  }

  (async function bootEntryGate() {
    /* dine-in.html: open table modal immediately — do not wait on restaurant flags */
    if (typeof window.LechaimAppSettings?.load === 'function') {
      try { await window.LechaimAppSettings.load(); } catch (_) { /* keep fallbacks */ }
    }
    if (gate.dataset.mode === 'dine-in-only') {
      setLang('he');
      if (!isStaffOrderPage() && await tryResumeSession()) {
        void bootRestaurantFlags();
        return;
      }
      goToTable();
      void bootRestaurantFlags();
      return;
    }

    setLang('he');
    await bootRestaurantFlags();
    if (await tryResumeSession()) return;

    goToOrderType();
    if (gate.classList.contains('is-home')) {
      setupHomeReveal();
      startAboutSlideshow();
    }
  })();
})();
