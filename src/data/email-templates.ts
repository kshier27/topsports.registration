export type StarterTemplate = { name: string; group: string; subject: string; body: string };

const SIGN = "\n\nIf you have any questions, simply reply to this email or contact us at info@topsports.ca. We're always happy to help.\n\nSee you soon,\nThe TOP Sports Team\nTOP Sports {{location}}";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // Before the program
  {
    group: "Before the Program",
    name: "Welcome & First Day Info",
    subject: "Welcome to {{programName}}, {{childName}}! Everything you need for day one",
    body:
      "Hi {{parentName}},\n\nThank you for registering {{childName}} for {{programName}}! Our coaches are excited to welcome you, and we want to make sure the first day goes smoothly.\n\nYOUR PROGRAM DETAILS\n- Program: {{programName}}\n- Session: {{sessionName}}\n- Dates: {{dates}}\n- Days & Time: {{days}}, {{time}}\n- Venue: {{venue}}\n\nDROP-OFF & PICK-UP\n- Please arrive 10–15 minutes before the start time on the first day so we can check {{childName}} in and introduce them to their coach and group.\n- Our staff will be at the main entrance wearing TOP Sports shirts. Look for the check-in table.\n- At pick-up, only the adults listed as authorized pickups on your registration can collect your child. Please be ready to show photo ID during the first week.\n\nWHAT TO BRING\n- A labelled water bottle (we have refill stations on site)\n- Nut-free lunch and two snacks (for full-day programs)\n- Comfortable athletic clothing and running shoes\n- Any required equipment for the sport, clearly labelled with your child's name\n- Sunscreen and a hat for outdoor activities\n- Any required medication (EpiPen, inhaler) in a labelled bag, handed to staff at check-in\n\nBEFORE DAY ONE\n- Sign in to My Family and confirm {{childName}}'s medical information, emergency contact and pickup names are up to date.\n- Add the program to your calendar from My Programs so you never miss a session." +
      SIGN,
  },
  {
    group: "Before the Program",
    name: "Program Reminder (1 Week Out)",
    subject: "One week to go: {{programName}} starts {{dates}}",
    body:
      "Hi {{parentName}},\n\nJust a friendly reminder that {{childName}}'s {{programName}} begins in one week. We're looking forward to a great session!\n\nQUICK DETAILS\n- Session: {{sessionName}}\n- Dates: {{dates}}\n- Days & Time: {{days}}, {{time}}\n- Venue: {{venue}}\n\nA FEW THINGS TO DO THIS WEEK\n1. Check that {{childName}}'s equipment still fits. Kids grow fast, and well-fitted gear is safer and more comfortable.\n2. Review the medical and allergy information on {{childName}}'s profile in My Family.\n3. Make sure your authorized pickup list is current.\n4. Plan to arrive 10 minutes early on the first day for check-in.\n\nIf your plans have changed and {{childName}} can no longer attend, please let us know as soon as possible through Manage Registration in My Programs. This lets us offer the spot to a family on the waitlist." +
      SIGN,
  },
  {
    group: "Before the Program",
    name: "What to Bring / Packing List",
    subject: "Packing list for {{programName}}",
    body:
      "Hi {{parentName}},\n\nTo help {{childName}} have the best possible experience at {{programName}}, here's a complete packing list. Please label everything with your child's name. Our lost and found fills up quickly!\n\nEVERY DAY\n- Refillable water bottle\n- Nut-free lunch and at least two snacks (we are a nut-aware facility)\n- Athletic clothing suited to the weather, plus a spare layer\n- Running shoes (indoor shoes if the program is in a gym)\n- Sunscreen and a hat for any outdoor time\n\nSPORT EQUIPMENT\n- Hockey: full CSA-approved equipment, skates sharpened, helmet with full cage, stick and water bottle\n- Soccer: shin pads, cleats or turf shoes, and running shoes for indoor time\n- Lacrosse: helmet, gloves, arm pads, mouth guard, stick and running shoes\n\nPLEASE LEAVE AT HOME\n- Valuables, electronics and toys\n- Any food containing nuts\n\nMEDICATION\nIf {{childName}} needs an EpiPen, inhaler or other medication, please hand it to a staff member at check-in in a labelled bag with instructions." +
      SIGN,
  },
  {
    group: "Before the Program",
    name: "Missing Information / Forms",
    subject: "Action needed: please complete {{childName}}'s profile",
    body:
      "Hi {{parentName}},\n\nWe're getting ready for {{programName}} and noticed some information is missing from {{childName}}'s profile. Having complete details helps our coaches keep every participant safe.\n\nPLEASE CHECK THE FOLLOWING IN MY FAMILY\n- Medical conditions and allergies (including whether an EpiPen or inhaler is needed)\n- Emergency contact name and phone number (someone other than yourself)\n- Authorized pickup names\n- Home address and school\n\nIt only takes a couple of minutes: sign in, open My Family, and tap Edit on {{childName}}'s profile.\n\nPlease update this before {{dates}}. If anything has changed since you registered, such as a new allergy or a new pickup person, please update it as well." +
      SIGN,
  },

  // During the program
  {
    group: "During the Program",
    name: "Weather / Closure",
    subject: "Important: {{programName}} cancelled on {{day}}",
    body:
      "Hi {{parentName}},\n\nDue to weather conditions, {{programName}} at {{venue}} is cancelled on {{day}}. The safety of our participants and staff always comes first, and we made this decision based on the latest forecasts and local advisories.\n\nWHAT THIS MEANS FOR YOU\n- There will be no supervision on site on {{day}}. Please do not drop {{childName}} off.\n- We will share a make-up date or a credit option with you within 48 hours.\n- All other sessions are running as scheduled unless we tell you otherwise.\n\nHOW WE'LL KEEP YOU UPDATED\nWe'll email any further changes to this address. If you have a second parent or guardian on your account, they will receive updates too.\n\nThank you for your patience and understanding." +
      SIGN,
  },
  {
    group: "During the Program",
    name: "Schedule or Venue Change",
    subject: "Schedule update for {{programName}}",
    body:
      "Hi {{parentName}},\n\nWe're writing to let you know about a change to {{childName}}'s {{programName}} ({{sessionName}}).\n\nWHAT'S CHANGING\n[Describe the change here, for example: \"On {{day}}, the session will run from 10:00am to 12:00pm instead of the usual time.\"]\n\nWHAT STAYS THE SAME\n- Session: {{sessionName}}\n- Regular days & time: {{days}}, {{time}}\n- Venue: {{venue}}\n\nYour calendar entry won't update automatically, so please adjust it if you've added this program to your calendar.\n\nIf this change doesn't work for your family, reply to this email and we'll do our best to find a solution, such as moving {{childName}} to another session or issuing an account credit. We apologize for any inconvenience." +
      SIGN,
  },
  {
    group: "During the Program",
    name: "Mid-Program Update",
    subject: "Halfway there: {{childName}}'s {{programName}} update",
    body:
      "Hi {{parentName}},\n\nWe're halfway through {{programName}}, and we wanted to share how things are going!\n\nWHAT WE'VE BEEN WORKING ON\n- Building core skills through fun, age-appropriate drills\n- Teamwork, communication and good sportsmanship\n- Small-sided games so every player gets plenty of touches\n\nCOMING UP NEXT\nIn the second half, we'll build on these foundations with more game play and challenges suited to each player's level.\n\nHOW YOU CAN HELP AT HOME\n- Ask {{childName}} about their favourite drill or game this week.\n- Encourage a little practice: 10–15 minutes a few times a week makes a big difference.\n- Make sure they're getting plenty of rest and water on program days.\n\nThank you for being part of the TOP Sports community." +
      SIGN,
  },
  {
    group: "During the Program",
    name: "Last Day Reminder",
    subject: "Last day of {{programName}} is coming up",
    body:
      "Hi {{parentName}},\n\nIt's hard to believe, but the final day of {{childName}}'s {{programName}} is almost here!\n\nON THE LAST DAY\n- Regular time and location: {{days}}, {{time}} at {{venue}}\n- Families are welcome to arrive 15 minutes before pick-up to watch the final games and celebrate with the group.\n- Please check the lost and found for any missing items. Anything left behind after one week is donated.\n\nWHAT'S NEXT\nIf {{childName}} enjoyed the program, our upcoming sessions are open for registration now. Spots fill quickly, especially for returning families, so we recommend booking early.\n\nThank you for trusting us with {{childName}} this session. It's been a pleasure coaching them!" +
      SIGN,
  },

  // After the program
  {
    group: "After the Program",
    name: "Thank You & Feedback",
    subject: "Thank you for joining {{programName}}!",
    body:
      "Hi {{parentName}},\n\nThank you for choosing TOP Sports for {{childName}}'s {{programName}}. Our coaches loved having {{childName}} in the group, and we hope it was a great experience for your whole family.\n\nWE'D LOVE YOUR FEEDBACK\nSimply reply to this email and tell us:\n- What did {{childName}} enjoy most?\n- Was there anything we could do better?\n- Would you recommend TOP Sports to a friend?\n\nEvery response is read by our program directors and helps us improve future sessions.\n\nYOUR RECORDS\nReceipts and year-end tax receipts are always available in My Family, under Receipts and Tax Receipts.\n\nWe hope to see {{childName}} back on the field, court or ice soon!" +
      SIGN,
  },
  {
    group: "After the Program",
    name: "Lost & Found",
    subject: "Lost & found items from {{programName}}",
    body:
      "Hi {{parentName}},\n\nWe've collected a number of items left behind at {{venue}} during {{programName}}, including water bottles, jackets, hats and some equipment.\n\nHOW TO CLAIM AN ITEM\n- Items are held at the TOP Sports {{location}} check-in table during regular program hours.\n- If you can't come in person, reply to this email with a description of the item and we'll let you know if we have it.\n- Labelled items are returned directly to families when possible.\n\nAll unclaimed items will be donated to a local charity two weeks after the program ends.\n\nThank you for helping us keep our venues tidy!" +
      SIGN,
  },

  // Registration & marketing
  {
    group: "Registration & Seasons",
    name: "Registration Open",
    subject: "Registration is now open for {{season}}!",
    body:
      "Hi {{parentName}},\n\nGreat news: registration for our {{season}} programs is now open at TOP Sports!\n\nWHAT'S AVAILABLE\n- Day camps with full-week and multi-week options\n- Hockey, Soccer and Lacrosse skill programs\n- Programs for a wide range of ages and skill levels, grouped by birth year\n\nWHY REGISTER EARLY\n- Popular sessions fill quickly, especially at our most requested venues.\n- Early-bird pricing is available for a limited time on select programs.\n- Sibling and multi-week discounts are applied automatically at checkout.\n\nHOW TO REGISTER\n1. Visit our website and choose your location.\n2. Pick the program and sessions that fit your schedule.\n3. Your children's profiles and pickup details are already saved, so checkout only takes a minute.\n\nIf a session is full, join the waitlist. We'll email you and hold the spot for 24 hours if one opens up." +
      SIGN,
  },
  {
    group: "Registration & Seasons",
    name: "Early-Bird Deadline",
    subject: "Last chance: early-bird pricing ends soon for {{season}}",
    body:
      "Hi {{parentName}},\n\nThis is a quick reminder that early-bird pricing for our {{season}} programs ends soon. After the deadline, regular pricing applies.\n\nWHY FAMILIES BOOK NOW\n- Save on every eligible session with early-bird rates\n- Stack savings with sibling and multi-week discounts\n- Secure spots before popular weeks and times fill up\n\nIt only takes a few minutes: your family details are saved, so just pick your sessions and check out.\n\nNot sure which program is right for your child? Reply to this email and our team will help you choose based on age, experience and schedule." +
      SIGN,
  },
  {
    group: "Registration & Seasons",
    name: "Spots Filling Fast",
    subject: "Limited spots left in {{programName}}",
    body:
      "Hi {{parentName}},\n\nWe wanted to give you a heads-up: {{programName}} at {{venue}} is almost full, and only a few spots remain.\n\nPROGRAM DETAILS\n- Season: {{season}}\n- Session: {{sessionName}}\n- Days & Time: {{days}}, {{time}}\n- Venue: {{venue}}\n\nIf you'd like to secure a place for your child, we recommend registering soon. Once the program is full, new registrations will go to the waitlist.\n\nAlready registered for another session? Siblings and additional weeks may qualify for a discount, applied automatically at checkout." +
      SIGN,
  },
  {
    group: "Registration & Seasons",
    name: "Next Season Invite (Returning Families)",
    subject: "{{childName}}, ready for your next season at TOP Sports?",
    body:
      "Hi {{parentName}},\n\nIt was wonderful having {{childName}} in {{programName}}! We'd love to keep the momentum going, so we're giving returning families first look at our upcoming programs.\n\nWHY COME BACK\n- Keep building skills with coaches who already know {{childName}}\n- Move up to the next level with players of similar age and ability\n- Your family profile, waivers and pickup details are saved, so registration takes just a minute\n\nRECOMMENDED NEXT STEPS\n- Check the program pages for {{childName}}'s birth year to see every eligible option.\n- Register siblings together to unlock the sibling discount.\n- Sessions fill quickly, so book early to get your preferred weeks and times.\n\nThank you for being part of the TOP Sports family." +
      SIGN,
  },

  // Account & admin
  {
    group: "Account & Payments",
    name: "Payment / Balance Reminder",
    subject: "Reminder: balance owing for {{programName}}",
    body:
      "Hi {{parentName}},\n\nOur records show there is an outstanding balance on {{childName}}'s registration for {{programName}} ({{sessionName}}).\n\nHOW TO PAY\n- Sign in to the TOP Sports website and open My Family to review your account.\n- If you'd prefer to pay by phone or have questions about the amount, reply to this email and our team will help.\n\nPlease complete payment before {{dates}} to keep {{childName}}'s spot. Spots with unpaid balances may be released to families on the waitlist.\n\nIf you've already paid, thank you, and please disregard this message." +
      SIGN,
  },
  {
    group: "Account & Payments",
    name: "Tax Receipts Available",
    subject: "Your TOP Sports tax receipts are ready",
    body:
      "Hi {{parentName}},\n\nYour year-end tax receipts for TOP Sports programs are now available to download.\n\nHOW TO DOWNLOAD\n1. Sign in to the TOP Sports website.\n2. Open My Family.\n3. Go to Tax Receipts and choose the year.\n\nEach receipt lists every child, the programs they attended, the amounts paid and our business details.\n\nGOOD TO KNOW\nIn Canada, day camps may qualify as child care expenses. Please speak with your accountant or check with the Canada Revenue Agency to confirm what you can claim.\n\nIf any information on your receipt looks incorrect, reply to this email and we'll fix it right away." +
      SIGN,
  },
  {
    group: "Account & Payments",
    name: "Waitlist Update",
    subject: "Waitlist update for {{programName}}",
    body:
      "Hi {{parentName}},\n\nThank you for your patience while {{childName}} is on the waitlist for {{programName}} ({{sessionName}}).\n\nHOW THE WAITLIST WORKS\n- Spots are offered in the order families joined the waitlist.\n- When a spot opens, we email you and hold it for 24 hours.\n- To accept, sign in and complete checkout before the deadline in that email. If you don't, the spot moves to the next family.\n\nWANT A GUARANTEED SPOT?\nOther sessions of {{programName}}, or similar programs at TOP Sports {{location}}, may still have space. Check the program page or reply to this email and we'll suggest options.\n\nYou can see your position or leave the waitlist anytime in My Programs." +
      SIGN,
  },
];
