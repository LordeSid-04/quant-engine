export const HOTSPOTS = [
    {
      id: "us",
      name: "United States",
      lat: 38, lng: -96,
      narrative: "AI Boom Resurgence",
      heat: 87,
      confidence: 92,
      color: "#22d3ee",
      regime: "Late-cycle expansion with tech-driven growth acceleration. AI capex boom extending economic cycle despite restrictive monetary stance.",
      narratives: ["AI Boom Resurgence", "Sticky Inflation", "Fiscal Dominance"],
      risks: ["Asset bubble formation in AI equities", "Persistent services inflation", "Treasury supply shock"],
      assets: { equities: "+", rates: "↑", fx: "Strong USD", commodities: "Neutral", credit: "Tight spreads" }
    },
    {
      id: "europe",
      name: "Europe",
      lat: 51, lng: 10,
      narrative: "Policy Divergence",
      heat: 64,
      confidence: 78,
      color: "#38bdf8",
      regime: "Stagnation with disinflationary pressure. ECB cutting ahead of Fed, widening transatlantic policy divergence.",
      narratives: ["Policy Divergence", "Energy Transition Drag", "Defense Spending Surge"],
      risks: ["Recession risk in Germany", "Energy price vulnerability", "Political fragmentation"],
      assets: { equities: "Mixed", rates: "↓", fx: "Weak EUR", commodities: "Bearish energy", credit: "Widening" }
    },
    {
      id: "china",
      name: "China",
      lat: 35, lng: 105,
      narrative: "China Stimulus",
      heat: 75,
      confidence: 68,
      color: "#fbbf24",
      regime: "Deflationary deleveraging with targeted stimulus. Property sector restructuring ongoing, tech sector stabilizing.",
      narratives: ["China Stimulus", "Deflation Risk", "Tech Decoupling"],
      risks: ["Property market contagion", "Capital flight acceleration", "Geopolitical escalation"],
      assets: { equities: "Selective", rates: "↓", fx: "Managed CNY", commodities: "Copper demand", credit: "Stress in property" }
    },
    {
      id: "middleeast",
      name: "Middle East",
      lat: 26, lng: 45,
      narrative: "Commodity Shock Risk",
      heat: 82,
      confidence: 71,
      color: "#f97316",
      regime: "Geopolitical flashpoint with global energy implications. Oil supply concentration risk elevated.",
      narratives: ["Commodity Shock Risk", "Geopolitical Repricing", "Petrodollar Recycling"],
      risks: ["Oil supply disruption", "Regional conflict escalation", "Shipping lane blockage"],
      assets: { equities: "Defense", rates: "Vol spike", fx: "CHF/JPY bid", commodities: "Oil spike", credit: "Risk-off" }
    },
    {
      id: "em",
      name: "Emerging Markets",
      lat: -10, lng: -52,
      narrative: "Sticky Inflation",
      heat: 58,
      confidence: 65,
      color: "#a78bfa",
      regime: "Divergent EM landscape. LatAm cutting rates, Asia stable, Africa under stress from dollar strength.",
      narratives: ["Sticky Inflation", "Dollar Squeeze", "Nearshoring Beneficiaries"],
      risks: ["Capital outflows on Fed delay", "Food price shock", "Debt distress in frontier markets"],
      assets: { equities: "Selective LatAm", rates: "Mixed", fx: "Under pressure", commodities: "Agri exposure", credit: "Selective" }
    },
    {
      id: "japan",
      name: "Japan",
      lat: 36, lng: 138,
      narrative: "Policy Normalization",
      heat: 70,
      confidence: 84,
      color: "#34d399",
      regime: "Historic monetary policy normalization. BOJ rate hikes creating yen volatility and carry trade unwind risk.",
      narratives: ["Policy Normalization", "Carry Trade Unwind", "Reflation"],
      risks: ["Yen volatility spikes", "Global carry unwind", "Wage-price spiral"],
      assets: { equities: "Bank rally", rates: "↑ JGBs", fx: "JPY strengthening", commodities: "Neutral", credit: "Stable" }
    }
  ];
  
  export const ARCS = [
    { from: "middleeast", to: "europe", label: "Oil Shock Transmission", color: "#f97316" },
    { from: "us", to: "em", label: "Rate Hike Spillover", color: "#22d3ee" },
    { from: "us", to: "japan", label: "AI Supply Chain", color: "#38bdf8" },
    { from: "china", to: "em", label: "Stimulus Demand Pull", color: "#fbbf24" },
    { from: "middleeast", to: "us", label: "Energy Price Pressure", color: "#f97316" },
    { from: "japan", to: "us", label: "Carry Trade Flows", color: "#34d399" },
  ];