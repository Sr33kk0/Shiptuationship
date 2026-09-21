import { CATS } from "@/lib/shipments";
import { Icon } from "./Icon";
import LogInButton from "./LogInButton";

// Sample shipment for the hero preview. It is illustrative only (the caption says so); the real values come from the customer's own SI and BL.
const SAMPLE = {
  si: { ref: "SI-0417", shipper: "Meridian Textiles Sdn Bhd", consignee: "Harbor & Vale Imports Ltd", notify: "Harbor & Vale Imports Ltd", pol: "Port Klang (MYPKG)", pod: "Rotterdam (NLRTM)", containers: "3", weight: "22,000" },
  bl: { ref: "BL-0417", shipper: "Meridian Textiles Sdn Bhd", consignee: "Harbor & Vale Imports Ltd", notify: "Harbor & Vale Imports Ltd", pol: "Port Klang (MYPKG)", pod: "Rotterdam (NLRTM)", containers: "4", weight: "22,000" },
};

function Doc({ kind }: { kind: "si" | "bl" }) {
  const d = SAMPLE[kind];
  return (
    <div className={`paper ${kind}`}>
      <div className="paper-head">
        <div>
          <h4>{kind === "si" ? "Shipping Instruction" : "Draft Bill of Lading"}</h4>
          <small>{kind === "si" ? "Customer Reference" : "Carrier Verification Draft"}</small>
        </div>
        <span className="ref">{d.ref}</span>
      </div>
      <div className="paper-body">
        <div>
          <span className="k">1. Shipper</span>
          <span className="v">{d.shipper}</span>
        </div>
        <div>
          <span className="k">2. Consignee</span>
          <span className="v">{d.consignee}</span>
        </div>
        <div>
          <span className="k">3. Notify Party</span>
          <span className="v">{d.notify}</span>
        </div>
        <div className="paper-row">
          <div>
            <span className="k">4. POL</span>
            <span className="v port">{d.pol}</span>
          </div>
          <div>
            <span className="k">5. POD</span>
            <span className="v port">{d.pod}</span>
          </div>
        </div>
        <div className="paper-row">
          <div>
            <span className="k">6. Containers</span>
            <span className={`v num${kind === "bl" ? " site-mark" : ""}`}>{d.containers} x 40HC</span>
          </div>
          <div>
            <span className="k">7. Gross Weight</span>
            <span className="v num">{d.weight} kg</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROBLEMS = [
  ["The right email gets lost.", "Staff have to read each message to decide what it needs. A document request that is overlooked never reaches the checking step."],
  ["Comparing by eye is slow and error-prone.", "Names, ports, quantities and weights must be checked across two documents. One missed discrepancy means corrections and delays."],
  ["The same detail is written many ways.", "One document says Port of Loading, the other says Load Port. Both mean the same field, and the check has to know it."],
];

const STEPS = [
  ["Classify", "Every email is sorted as a document comparison request, a new SI request, an invoice query, a general message or other. Only comparison requests continue to the checking step."],
  ["Extract", "SI and BL attachments are read whether they arrive as PDF, Word, Excel or plain text. Labels such as POL, Load Port and G.W. are mapped to the same seven fields, and weights are converted to kilograms."],
  ["Compare", "A fixed set of rules, not a language model, checks each field, so the same input always gives the same answer. Formatting differences are recorded but not flagged, which keeps real discrepancies visible."],
  ["Review", "Anything uncertain goes to a moderator with the source and the reason. They see the SI and the Draft BL side by side, correct a value, save, and the comparison runs again."],
  ["Audit", "Every action is logged: a User Log for what moderators did and a System Log for what the automation did."],
];

const FIELDS = ["Shipper", "Consignee", "Notify Party", "Port of Loading (POL)", "Port of Discharge (POD)", "Container count", "Gross weight (kg)"];

const RULES = [
  ["Container count", "Must be exactly equal."],
  ["Gross weight", "Equal within 0.5%."],
  ["Text fields", "Compared after case, punctuation and port codes are normalised."],
  ["Missing on one side", "Always flagged."],
];

const FEATURES = [
  ["Dashboard", "Live counts of read and unread email, comparison requests cleared and pending, emails by category, top shippers and consignees, and world maps of loading and discharge ports."],
  ["Emails", "A familiar inbox with filters, search, date ranges and sortable columns. Every view has its own link, so a filtered list can be shared."],
  ["Review screen", "The SI and Draft BL side by side with differing fields in red. Edit either document, save, and print the whole email as an A4 PDF."],
  ["Audit logs", "A User Log of every moderator action with before-and-after values, and a System Log of everything the automation did."],
  ["Five colour schemes", "Light, Dark, Ocean, Forest and Sunset, applied before the page paints so there is no flash."],
  ["Any screen", "A drawer menu and card lists on phones and tablets, and reduced-motion support throughout."],
];

export default function Landing() {
  return (
    <div className="site">
      <header className="site-nav">
        <div className="site-wrap site-nav-in">
          <a className="site-brand" href="/" aria-label="Shiptuationship, home">
            <div className="logo">
              <img src="/shiplogo.svg" alt="" />
            </div>
            <span>Shiptuationship</span>
          </a>
          <nav aria-label="Page sections">
            <a href="#how">How it works</a>
            <a href="#compare">What we compare</a>
            <a href="#features">Features</a>
          </nav>
          <LogInButton className="site-btn dark">Log in</LogInButton>
        </div>
      </header>

      <main>
        <section className="site-wrap hero">
          <div className="hero-copy fade-up">
            <h1>Catch the mismatch before the ship sails.</h1>
            <p className="lede">Shiptuationship reads every incoming shipping email, compares the Shipping Instruction against the draft Bill of Lading on seven fields, and hands anything uncertain to a person, with the evidence attached.</p>
            <div className="hero-cta">
              <LogInButton className="site-btn dark lg">Log in</LogInButton>
              <a className="site-btn ghost lg" href="#how">
                See how it works
              </a>
            </div>
          </div>

          <figure className="pv fade-up" style={{ "--d": "0.15s" } as React.CSSProperties} aria-label="A sample comparison in Shiptuationship: the Draft BL lists 4 containers where the SI lists 3">
            <div className="pv-bar">
              <b>Manifest Inspection</b>
              <span className="tag" style={{ color: CATS["document-comparison"].color, background: CATS["document-comparison"].bg }}>
                SI vs Draft BL
              </span>
            </div>
            <div className="banner">
              <div>
                <Icon d="alert" sw={2} />
                <span>
                  <strong>Human review required:</strong> Container Count (3 on SI vs 4 on Draft BL)
                </span>
              </div>
            </div>
            <div className="pv-docs">
              <Doc kind="si" />
              <Doc kind="bl" />
            </div>
            <figcaption>Sample data, for illustration.</figcaption>
          </figure>
        </section>

        <section className="site-sec alt" id="why">
          <div className="site-wrap site-why">
            <h2>A shared inbox hides the emails that matter.</h2>
            <ul>
              {PROBLEMS.map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="site-sec" id="how">
          <div className="site-wrap">
            <h2>From raw email to a clear report in five steps.</h2>
            <ol className="site-steps">
              {STEPS.map(([title, text], i) => (
                <li key={title}>
                  <span className="n">{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="site-sec alt" id="compare">
          <div className="site-wrap">
            <h2>Seven fields, checked the same way every time.</h2>
            <div className="site-cmp">
              <ol className="site-fields">
                {FIELDS.map((f, i) => (
                  <li key={f}>
                    <span>{i + 1}</span>
                    {f}
                  </li>
                ))}
              </ol>
              <div>
                <dl className="site-rules">
                  {RULES.map(([term, text]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{text}</dd>
                    </div>
                  ))}
                </dl>
                <p className="site-example">
                  <strong>A worked example.</strong> The SI lists 3 containers and 22,000 kg, the Draft BL lists 4 containers and 22,000 kg. Everything else agrees, so only Container Count is flagged, shown as SI 3 against BL 4.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="site-sec" id="features">
          <div className="site-wrap">
            <h2>Everything the desk needs.</h2>
            <ul className="site-feats">
              {FEATURES.map(([title, text]) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="site-band">
          <div className="site-wrap">
            <h2>Not sure? It asks a person, and says why.</h2>
            <p>If a document is unreadable, a value is missing or the result is uncertain, the case goes to a moderator with the reason. Corrections are stored separately, so the original extraction is never overwritten.</p>
            <LogInButton className="site-btn inv lg">Log in to the desk</LogInButton>
          </div>
        </section>
      </main>

      <footer className="site-foot">
        <div className="site-wrap">
          <span>Shiptuationship · SI &amp; BL Verification Desk</span>
          <span>Built for the Averis Hackathon 2026</span>
        </div>
      </footer>
    </div>
  );
}
