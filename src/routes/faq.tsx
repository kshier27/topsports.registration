import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LOCATIONS } from "@/data/registration";
import { SITE } from "@/lib/site-settings";

export const Route = createFileRoute("/faq")({ component: FaqPage });

type QA = { q: string; a: string };
type Section = { id: string; title: string; items: QA[] };

const SECTIONS: Section[] = [
  {
    id: "registration",
    title: "Registration",
    items: [
      { q: "How do I register my child for a program?", a: "Start by choosing your location on the home page, then open the program you're interested in. Select the session or sessions you'd like, choose which child is attending and complete the Participant Details. Once you've read and accepted the required policies, tap Add to Cart and check out from your cart." },
      { q: "Can I register more than one child, or more than one week, at the same time?", a: "Yes. You can add as many children and sessions to your cart as you like and pay for everything in a single checkout. Each child keeps their own participant details, friend request and authorized pickup list." },
      { q: "Why can't I add a program to my cart?", a: "This usually means registration hasn't opened yet or has already closed. The program page shows the exact opening and closing date and time. You'll also need to answer every required participant question and accept each policy before the Add to Cart button becomes available." },
      { q: "How do friend requests work?", a: "Each participant can include one friend request on their registration. We do our best to place friends together, although we can't guarantee it. For the best chance, both families should request each other." },
      { q: "Who is allowed to pick up my child?", a: "Only the parents or guardians on the registration and the people you list under Authorized Pickup Names can pick up your child. Our staff may ask for photo ID at pickup, so please let your authorized adults know to bring it." },
    ],
  },
  {
    id: "account",
    title: "Account Management",
    items: [
      { q: "Do I need an account to register?", a: "Yes. The first time you register, tap Log In or My Family to create your family account. You'll stay signed in on that device, so returning to register again is quick." },
      { q: "I forgot my password. What should I do?", a: "On the sign-in screen, tap Forgot Password and enter the email address on your account. We'll email you a secure link so you can set a new password." },
      { q: "How do I update my child's medical or emergency information?", a: "Open My Family, choose your child and edit their details, then save your changes. Your updates will be used for all future registrations. If your child is already registered for an upcoming program, please also email your location so the coaches have the latest information." },
      { q: "Who can I list as an emergency contact?", a: "Your emergency contact must be someone other than a parent or guardian on your account, such as a grandparent, relative or family friend. This gives us another trusted adult to call if we can't reach you." },
      { q: "Where can I see what my children are registered for?", a: "My Programs has three tabs: Schedule (a weekly calendar or list of upcoming programs), Registrations (full details for each program) and History (payments, refunds and credits). Tap any program to see the full overview, including the participant, dates, schedule, location, out dates and add-ons." },
    ],
  },
  {
    id: "coupons",
    title: "Using a Coupon",
    items: [
      { q: "Where do I enter a coupon code?", a: "On the Review Registration page, type your code into the Coupon Code box in the Receipt panel and tap Apply. The discount will appear on your receipt before you pay." },
      { q: "Why isn't my coupon working?", a: "Coupon codes can expire, reach their usage limit or be paused by our staff. Please double-check the spelling first. If the code still doesn't work, contact your location before you complete payment." },
      { q: "Can I use a coupon together with account credit?", a: "Yes. Your coupon is applied first, and any available account credit is then applied to the remaining balance." },
    ],
  },
  {
    id: "payments",
    title: "Payments & Receipts",
    items: [
      { q: "How do I pay?", a: "When you check out, you'll be taken to Stripe's secure payment page to enter your card details. TOP Sports never sees or stores your card number." },
      { q: "Is HST charged?", a: "HST of 13% is added at checkout on programs where it applies. Our camps are not charged HST." },
      { q: "How do I get a receipt?", a: "Your confirmation page includes a Print Receipt button, and a confirmation email is sent once your payment is complete. You can also find your full payment history, along with year-end camp tax receipts, in My Family." },
    ],
  },
  {
    id: "refunds",
    title: "Refunds & Transfers",
    items: [
      { q: "What is the refund policy?", a: "Refunds are available up to 30 days before a program begins. Summer camps have a firm refund deadline of May 31. A $50 administration fee applies to every refund, and refunds and transfers are no longer available once the deadline has passed." },
      { q: "How do I request a refund or transfer?", a: "Open My Programs, go to the Registrations tab, find the registration and tap Manage Registration. Requests made before the deadline are reviewed by our staff, and approved refunds are returned to your original card." },
      { q: "How long does a refund take to reach my card?", a: "Approved refunds are sent to your card right away. Most banks show the refund on your statement within 5 to 10 business days." },
      { q: "Can I switch to a different week or session?", a: "Yes, as long as it's before the deadline. Choose Transfer in Manage Registration and pick a session that still has space. Any difference in price is settled through your account." },
    ],
  },
  {
    id: "waitlists",
    title: "Waitlists",
    items: [
      { q: "A session is full. Can I still get a spot?", a: "Yes. Join the waitlist from the program page. If a spot opens up, the next family in line receives an email saying the spot is held for them for 24 hours, with the exact deadline. Sign in and check out before then to claim it. If the hold runs out, the spot is offered to the next family." },
      { q: "What happens if a session fills while it's in my cart?", a: "The item in your cart shows a red This session just filled up box with Remove and Join Waitlist buttons, so you can fix it right there. If it fills during checkout, the message includes a Fix in Cart button that takes you straight back." },
      { q: "Will I be charged for joining a waitlist?", a: "No. Joining a waitlist is free. You only pay if you accept an offered spot and complete checkout." },
    ],
  },
  {
    id: "finding-programs",
    title: "Finding & Choosing Programs",
    items: [
      { q: "How are programs ordered on a location page?", a: "Programs are listed by their first session date, with the soonest-starting program first. Each card shows a status such as Opens (date), Registration Closed, Full · Waitlist Open, Closes Soon or Spots Limited." },
      { q: "How do I find programs my child can join?", a: "Use the Born In dropdown beside the search box on a location page. If you're signed in, your children appear at the top of the list, for example Emma (2017). Programs now use birth years, such as Born 2015–2021, to decide who is eligible." },
      { q: "What does the Age As Of date mean?", a: "Each program lists the birth years that can register. Staff decide whether age is counted as of the program start date or this calendar year. If your child's birth year isn't in the range, they show as not eligible." },
      { q: "What if a program hasn't opened yet?", a: "The program shows when registration opens. Tap Notify Me to save a calendar reminder that alerts you 15 minutes before it opens. It doesn't send an email." },
      { q: "Where is the program location, and can I get directions?", a: "Tap the venue name on a program page or session card to open it in Google Maps. The street address is shown beside it." },
      { q: "What are out dates?", a: "Out dates are days a program doesn't run, such as holidays. They appear on the program page, in your cart, on your receipt, in your confirmation email and in My Programs." },
    ],
  },
  {
    id: "sessions-options",
    title: "Sessions, Options & Savings",
    items: [
      { q: "What is the difference between a session and an option?", a: "A session is the block you register for, such as Active Start. Some sessions have several options with their own days, times, dates, price and location, such as Mon 6pm or Wed 6pm. After picking a session, choose an option for it." },
      { q: "Can I pick more than one option?", a: "Yes. Tap several options and each becomes its own registration in your cart. Tap a selected option again to remove it. When a session offers a Multi-Session Discount, the message above the options tells you how much you save on each additional option." },
      { q: "When do I see the price?", a: "As soon as you pick an option, its price is added to the summary. Until you choose a child, the summary says Pick a participant and the button reads Pick a Participant." },
      { q: "What discounts might apply?", a: "Depending on the program, you may see sibling, multi-week or multi-session savings and early-bird pricing. The cart shows a You're saving banner and lists each saving in the summary. Coupons and account credit apply on the Review Registration page." },
      { q: "Why is a button greyed out or marked with a red star?", a: "A red star beside a step means it isn't finished yet. The bottom bar on your phone says Finish the steps marked * until the form is complete. You need a session, an option if one is offered, a participant, the required answers and every policy accepted." },
      { q: "Why can't I tap I AGREE on a policy?", a: "Scroll to the end of the policy first. I AGREE unlocks once you've reached the bottom. Short policies that fit on screen unlock right away." },
    ],
  },
  {
    id: "phone-cart",
    title: "Using Your Phone & Cart",
    items: [
      { q: "How do I register another child quickly?", a: "After you add a registration to the cart, your session, option and add-on choices stay selected. Pick the next child and add them. Tap Start Over in the pop-up if you want to clear everything." },
      { q: "Will my child's pickup names be filled in for me?", a: "Yes. When you pick a child, the authorized pickup names from their last registration fill in automatically. You can edit or remove them before adding to the cart." },
      { q: "How is my cart organized?", a: "The cart is grouped by child, with a heading showing each child's registrations and total. Tap Remove to take something out. An Undo message appears in case you tapped by mistake." },
      { q: "What if my cart is empty?", a: "You'll see a button back to the last location you visited. The bottom cart bar on program and location pages shows your registrations, subtotal and View Cart once you've added something." },
      { q: "What if something goes wrong at checkout?", a: "If a session fills up, registration closes or your connection drops, you'll see a clear message. It also tells you whether you were charged. If you weren't, you can simply try again or choose another session. If a session filled, tap Fix in Cart to remove it or join its waitlist." },
      { q: "What happens after I tap Add to Cart?", a: "A message pops up at the bottom of the screen with Checkout → and a quick next step, such as Add Emma (a sibling) or Add Another Week. When a discount applies, it tells you what you'd save, for example Add Emma too and save 10%." },
      { q: "Will my child's jersey size and answers be filled in?", a: "Yes. When you pick a child, their jersey size and answers to program questions fill in from their most recent registration. Answers only carry over when the question is worded the same way. You can change anything before adding to the cart." },
      { q: "Can I change something already in my cart?", a: "To change a session, option or add-on, remove the item and add it again. If you registered the same program twice for the same child, use the − and + buttons on the cart item to adjust the quantity." },
      { q: "How do I know what I'll be charged?", a: "The Pay button shows your exact total, for example Pay $412.50, after any discounts, coupons and account credit." },
      { q: "Can I pay with Apple Pay or Google Pay?", a: "When your device and browser support them, they appear as options on Stripe's secure payment page alongside card payment." },
    ],
  },
  {
    id: "my-family",
    title: "My Family & My Programs",
    items: [
      { q: "What does the weekly calendar show?", a: "In My Programs, the Schedule tab opens in a Week view. Each day lists every child's programs with the child's name, program, session and time, and today is highlighted. Use the arrows and This Week to move around, or switch to List for the month-by-month view. Out dates are crossed out. The child chips filter the calendar." },
      { q: "How do I add a program to my calendar?", a: "In My Family, each confirmed registration has Add to Google Calendar and Apple / Outlook (.ics) buttons. Out dates are listed in the event notes." },
      { q: "What is Profile % complete?", a: "Each child card shows how complete their profile is, counting only the required fields: name, date of birth, home address, city, postal code, school and the emergency contact (name, phone and relationship). Tap Finish to fill in what's missing, ideally before the first day." },
      { q: "How do I add a child?", a: "In My Family, tap + Add a Child to open the form. Tap Edit or Finish on a child card to update their details." },
      { q: "Can I list more than one allergy or medical condition?", a: "Yes. In the child's profile, tap every condition that applies, such as nut allergy, asthma or EpiPen. To add something that isn't listed, type it in and tap Add. Each one can be removed with ×. Changes reach the coaches' rosters for upcoming programs automatically." },
      { q: "Can my co-parent have their own login?", a: "Yes. In My Family, go to Co-Parent Access, enter their email and tap Send Invite. They create their own login with that email and their own password, open My Family and tap Accept. They can then see your children, active registrations and receipts. You can remove their access at any time, and they can leave on their own." },
      { q: "What does my calendar event include?", a: "Each event is titled TOP Sports — Program (Child) and lists the program, session, full dates, days and times, the venue with its address, and the child's name. Out dates are included when a program has them." },
      { q: "How can I see the status of a refund request?", a: "A registration with a refund request shows a tracker that moves from Pending review to Approved to Refunded. Declined or cancelled requests say so. Each registration also shows its status: Confirmed, Refund Requested, Refunded, Credited or Transferred." },
      { q: "What if staff change my registration?", a: "If our staff transfer, refund or credit a registration, you'll get a confirmation email explaining what changed, including the amount or the new schedule and location. The change also appears in your registration history." },
      { q: "Where are my tax receipts?", a: "Open My Family and look for Tax Receipts. One child care expense receipt is created per child per year for camp registrations. Refunded or transferred camps are left out." },
      { q: "Can I share my confirmation with my co-parent?", a: "Yes. On the confirmation page, tap Share Confirmation. On a phone it opens your share menu, and on a computer it opens an email." },
      { q: "What reminder emails will I receive?", a: "Many programs send a Before Your First Day email a few days before the start, with the venue and address, times, out dates and what to bring. You'll also get a reminder if you started checkout but didn't finish, and an email whenever a waitlist spot is held for you." },
      { q: "Where can I find the club's contact details?", a: "Your location's phone and email are on the confirmation page after you pay, in your confirmation email and at the bottom of this page." },
      { q: "Why can't my child register for a program?", a: "Programs are set by birth year. Under the participant buttons you'll see a line like \"William was born 2014. This program is for children born 2015–2021\", with a link to programs that fit." },
      { q: "Where can I see my waitlist position?", a: "In My Family, each waitlist entry shows your place in line, for example #3 in line. When a spot opens, the next family is offered it by email." },
      { q: "Can I sign in with Google?", a: "Yes. On the sign-in page, tap Continue with Google under the email form. If you forget your password, tap Forgot Password? to get a reset link." },
      { q: "Can I add the site to my phone's home screen?", a: "Yes. In Safari tap Share → Add to Home Screen, or in Chrome tap the menu → Add to Home Screen. The site then opens full-screen with the TOP Sports icon." },
      { q: "Is there an early-bird price?", a: "Some programs offer an early-bird discount until a set date. The program page shows when it ends, and the price switches to the regular price automatically after that." },
      { q: "Why do I type my name when agreeing to the policies?", a: "After ticking I AGREE on each policy, you type your full first and last name as your electronic signature. Your Signed Waivers record in My Family shows your signature, the date and time, and the exact policy wording you agreed to, even if a policy is updated later." },
      { q: "Why am I asked to confirm my child's info?", a: "Once per season, before registering, you confirm your child's medical info and emergency contact are still correct. It's remembered for the rest of that season. If something changed, tap Edit to update the profile first." },
      { q: "Can I register by phone or pay by cash or cheque?", a: "Yes. Contact your location and our staff can register your child for you and record an offline payment. The registration then appears in your My Family account under the same email." },
    ],
  },
];

function FaqPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return SECTIONS;
    return SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => (i.q + " " + i.a).toLowerCase().includes(t)) })).filter((s) => s.items.length);
  }, [query]);

  return (
    <main className="bg-background">
      <section className="border-b border-border bg-card">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:py-16">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Help Centre</p>
          <h1 className="display-condensed mt-2 text-4xl font-black italic md:text-5xl">Frequently Asked Questions</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">Answers to the most common questions about registering, your family account, coupons, payments and refunds.</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions…"
            className="mt-6 h-12 w-full rounded-xl border border-input bg-background px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="shrink-0 rounded-full border border-border px-3.5 py-2 text-sm font-semibold hover:bg-accent">{s.title}</a>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6 md:py-14">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-semibold">No questions match "{query}"</p>
            <button onClick={() => setQuery("")} className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Clear Search</button>
          </div>
        )}
        {filtered.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="text-xl font-bold">{s.title}</h2>
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {s.items.map((i) => {
                const key = s.id + i.q;
                const isOpen = open === key || !!query.trim();
                return (
                  <div key={key}>
                    <button
                      type="button"
                      onClick={() => setOpen(open === key ? null : key)}
                      className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left font-semibold hover:bg-accent/50"
                      aria-expanded={isOpen}
                    >
                      <span>{i.q}</span>
                      <span className={`shrink-0 text-xl leading-none text-muted-foreground transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
                    </button>
                    {isOpen && <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{i.a}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        <section className="rounded-2xl bg-primary p-6 text-primary-foreground md:p-8">
          <h2 className="text-xl font-bold">Still Have a Question?</h2>
          <p className="mt-1 text-sm opacity-90">Reach your location team directly.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {LOCATIONS.map((l) => (
              <a key={l.slug} href={`mailto:${l.slug === "toronto" ? "info" : l.slug}@topsports.ca`} className="rounded-xl bg-primary-foreground/10 px-4 py-3 text-sm hover:bg-primary-foreground/20">
                <span className="block font-semibold">{l.name}</span>
                <span className="opacity-90">{l.slug === "toronto" ? "info" : l.slug}@topsports.ca</span>
              </a>
            ))}
          </div>
          {SITE.supportEmail && <p className="mt-4 text-xs opacity-80">General: {SITE.supportEmail}</p>}
          <Link to="/programs" className="mt-5 inline-flex rounded-full bg-background px-5 py-2.5 text-sm font-semibold text-foreground">Browse All Programs</Link>
        </section>
      </div>
    </main>
  );
}
