export default function About() {
  return (
    <div className="about-page">

      <div className="about-hero">
        <h1 className="about-name">Vincent Wu</h1>
        <p className="about-tagline">Growth & Product · PlatePost · Chicago</p>
      </div>

      <div className="about-section">
        <p className="about-body">
          I'm Vincent — I work in food tech, write about food, and built a tool to find it.
          Growth and product at <a href="https://platepost.com" target="_blank" rel="noopener noreferrer" className="about-link">PlatePost</a> by
          day, documenting Chicago one meal at a time by night.
        </p>
        <p className="about-body">
          The Ledger is my personal shortlist of Chicago spots worth visiting. The blog is where I
          think out loud about food, culture, and everything in between.
        </p>
      </div>

      <div className="about-divider" />

      <div className="about-section">
        <p className="about-label">Currently</p>
        <ul className="about-currently">
          <li>Oracle Cloud Financials Consultant at IBM</li>
          <li>Working on <a href="https://platepost.com" target="_blank" rel="noopener noreferrer" className="about-link">PlatePost</a>'s go-to-market</li>
          <li>Building out the Ledger</li>
          <li>Publishing a food essay series on <a href="https://substack.com" target="_blank" rel="noopener noreferrer" className="about-link">Substack</a></li>
        </ul>
      </div>

      <div className="about-divider" />

      <blockquote className="about-quote">
        "Food brings people together, and allows us to share our life experiences in a single bite."
      </blockquote>

      <div className="about-divider" />

      <div className="about-section">
        <p className="about-label">Get in touch</p>
        <div className="about-contact">
          <a href="mailto:1104vincentwu@gmail.com" className="about-contact-link">
            1104vincentwu@gmail.com
          </a>
          <a href="https://linkedin.com/in/vinwu1" target="_blank" rel="noopener noreferrer" className="about-contact-link">
            LinkedIn →
          </a>
        </div>
      </div>

    </div>
  );
}
