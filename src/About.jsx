export default function About() {
  return (
    <div className="about-page">

      <div className="about-hero">
        <h1 className="about-name">Vincent Wu</h1>
        <p className="about-tagline">Growth & Product · PlatePost · Chicago</p>
      </div>

      <div className="about-bio">
        <p>
          I'm Vincent — I work in food tech, write about food, and built a tool to find it.
          Growth and product at <a href="https://platepost.com" target="_blank" rel="noopener noreferrer" className="about-link">PlatePost</a> by
          day, documenting Chicago one meal at a time by night.
        </p>
        <p>
          The Ledger is my personal shortlist of spots worth visiting. The blog is where I
          think out loud about food, culture, and everything in between.
        </p>
        <p className="about-food-line">
          "Food brings people together, and allows us to share our life experiences in a single bite."
        </p>
      </div>

      <div className="about-contact">
        <a href="mailto:1104vincentwu@gmail.com" className="about-contact-link">
          1104vincentwu@gmail.com
        </a>
        <a href="https://linkedin.com/in/vinwu1" target="_blank" rel="noopener noreferrer" className="about-contact-link">
          LinkedIn
        </a>
      </div>

    </div>
  );
}
