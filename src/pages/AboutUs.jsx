import React, { useEffect } from "react";
import "../css/AboutUs.css";
import NavRegister from "../components/NavRegister.jsx";
// src/pages/AboutUs.jsx
import heroImg from "../assets/AboutUsSection.jpg";
import whatWeDoImg from "../assets/WhatWeDo.jpg";


export default function AboutUs() {
    useEffect(() => {
        // Hide the global header (green bar) when on /about
        const globalHeader = document.querySelector("header"); // global Header component
        const previousDisplay = globalHeader?.style.display;
        if (globalHeader) globalHeader.style.display = "none";
        return () => {
          if (globalHeader) globalHeader.style.display = previousDisplay || "";
        };
      }, []);

  return (
    <div className="about-page">
      <NavRegister />

      <main id="top">
        <section className="about-hero">
          <div className="about-hero__grid container">
            <div className="hero-text">
              <p className="tagline">About Us</p>
              <h2>Making health information clear, accessible, and useful</h2>
              <h3>From wearable data to real-world impact.</h3>
              <p>
                Our platform connects with wearable devices and health apps to
                turn raw data into clear charts and practical insights. Built
                with older adults in mind and designed for researchers, it
                bridges everyday tracking and meaningful analysis.
              </p>
            </div>

            <div className="about-hero__image">
              <img src={heroImg} alt="Health data visualisation" />
            </div>
          </div>
          <div className="about-antihero__grid container">
              <div className="about-antihero__image">
                <img src={whatWeDoImg} alt="Health data visualisation" />
              </div>
            <div className="antihero-text">
             <h2>What we do</h2>
             <p>
               We securely gather health information from connected
               wearables—such as activity, heart rate, and sleep—and organise it
               into easy-to-read visualisations. Individuals can monitor trends
               over time while research teams review anonymised, aggregated data
               to uncover patterns that support better health outcomes.
             </p>
              <h2>Why it matters</h2>
                <p>
                  Health data is only useful when it’s understandable. By
                  prioritising accessible design—larger type, high contrast, simple
                  navigation, and keyboard-friendly controls—we empower people to
                  engage with their wellbeing and enable researchers to act on
                  high-quality insights.
                </p>
            </div>
          </div>
        </section>


        <section className="container content-grid">
          <article className="panel">
            <h2>Ongoing stewardship</h2>
             <p>
               As the platform evolves, its maintainers will continue to expand
               device compatibility, refine features, and keep user needs at the
               centre—ensuring the experience remains trustworthy, inclusive, and
               effective.
             </p>
          </article>

          <aside className="panel">
            <h2>Contact us</h2>
            <p>
              We believe your questions and suggestions are valuable. Contact
              details will be added here soon, so you can reach out directly
              with feedback and ideas.
            </p>
          </aside>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-grid">
          <div className="footer-tagline">
            From wearable data to real-world impact.
          </div>
          <div className="legal">
            © {new Date().getFullYear()} Health Data Platform. All rights
            reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}