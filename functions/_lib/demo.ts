// Data enrichments for the SuperPlane demo project, collected outside the app (Ahrefs, company data).
// Applied once per version to workspaces with settings.demo = true; never overwrites edited fields except metrics.
export const DEMO_PATCH: { version: number; client: Record<string, any>; companies: Record<string, Record<string, any>> } = {
  "version": 2,
  "client": {
    "founded": 2025,
    "employees": "13",
    "hq": "San Francisco, United States",
    "linkedin": "https://www.linkedin.com/company/superplane",
    "last_round": "$2.6M pre-seed (Credo Ventures), Jun 2026",
    "founder": "Darko Fabijan",
    "ahrefs": {
      "dr": 57,
      "traffic": 21,
      "refdomains": 1380,
      "brand_query": "superplane",
      "brand_us": 40,
      "brand_global": 200,
      "as_of": "2026-11"
    },
    "data_sources": [
      "Apollo",
      "Ahrefs"
    ]
  },
  "companies": {
    "factory": {
      "founded": 2023,
      "employees": "150",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/factory-hq",
      "last_round": "Venture round (Menlo Ventures), Oct 2026",
      "ahrefs": {
        "dr": 77,
        "traffic": 12905,
        "refdomains": 4857,
        "brand_query": "factory ai",
        "brand_us": 5700,
        "brand_global": 13000,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "devin": {
      "ahrefs": {
        "dr": 84,
        "traffic": 23542,
        "refdomains": 24908,
        "brand_query": "devin ai",
        "brand_us": 12000,
        "brand_global": 38000,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Ahrefs"
      ]
    },
    "openhands": {
      "employees": "34",
      "hq": "Los Angeles, United States",
      "linkedin": "https://www.linkedin.com/company/openhands-ai",
      "last_round": "$18.8M Series A (Menlo Ventures, Obvious Ventures), Nov 2025",
      "ahrefs": {
        "dr": 74,
        "traffic": 13082,
        "refdomains": 4003,
        "brand_query": "openhands",
        "brand_us": 6200,
        "brand_global": 26000,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "warp": {
      "founded": 2020,
      "employees": "98",
      "hq": "New York, United States",
      "linkedin": "https://www.linkedin.com/company/warpdotdev",
      "last_round": "$50M Series B (Sequoia, Marc Benioff), Jun 2023",
      "ahrefs": {
        "dr": 79,
        "traffic": 66465,
        "refdomains": 12496,
        "brand_query": "warp terminal",
        "brand_us": 8300,
        "brand_global": 43000,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "tembo": {
      "founded": 2024,
      "employees": "32",
      "hq": "Cincinnati, United States",
      "linkedin": "https://www.linkedin.com/company/tembo-inc",
      "last_round": "$14M Series A (Defined Capital, GreatPoint Ventures), Jul 2024",
      "ahrefs": {
        "dr": 69,
        "traffic": 712,
        "refdomains": 1689,
        "brand_query": "tembo ai",
        "brand_us": 80,
        "brand_global": 250,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "augment": {
      "founded": 2022,
      "employees": "180",
      "hq": "Palo Alto, United States",
      "linkedin": "https://www.linkedin.com/company/augmentinc",
      "last_round": "Acquired by Harness, Oct 2026",
      "ahrefs": {
        "dr": 76,
        "traffic": 24611,
        "refdomains": 9082,
        "brand_query": "augment code",
        "brand_us": 5200,
        "brand_global": 20000,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "port": {
      "founded": 2022,
      "employees": "250",
      "hq": "Middletown, United States",
      "linkedin": "https://www.linkedin.com/company/getport",
      "last_round": "$100M Series C (Accel, Bessemer Venture Partners), Dec 2025",
      "ahrefs": {
        "dr": 71,
        "traffic": 9539,
        "refdomains": 4868,
        "brand_query": "port.io",
        "brand_us": 200,
        "brand_global": 700,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "harness": {
      "founded": 2017,
      "employees": "1900",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/harnessinc",
      "last_round": "$200M Series E (Goldman Sachs Asset Management), Dec 2025",
      "founder": "Jyoti Bansal",
      "ahrefs": {
        "dr": 79,
        "traffic": 47857,
        "refdomains": 11905,
        "brand_query": "harness.io",
        "brand_us": 400,
        "brand_global": 800,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "copilot": {
      "founded": 2008,
      "employees": "7000",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/github",
      "last_round": "Part of GitHub (Microsoft)",
      "ahrefs": {
        "dr": 97,
        "traffic": 764677,
        "refdomains": 34850,
        "brand_query": "github copilot",
        "brand_us": 135000,
        "brand_global": 808000,
        "as_of": "2026-11",
        "note": "github.com DR; traffic of the Copilot pages"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "cursor": {
      "founded": 2022,
      "employees": "900",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/cursorai",
      "last_round": "$2.3B Series D (Thrive Capital, a16z), Nov 2025",
      "ahrefs": {
        "dr": 91,
        "traffic": 407631,
        "refdomains": 63084,
        "brand_query": "cursor ai",
        "brand_us": 81000,
        "brand_global": 584000,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "claude-code": {
      "employees": "6200",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/anthropicresearch",
      "last_round": "Part of Anthropic",
      "founded": 2021,
      "ahrefs": {
        "dr": 92,
        "traffic": 0,
        "refdomains": 19491,
        "brand_query": "claude code",
        "brand_us": 486000,
        "brand_global": 2670000,
        "as_of": "2026-11",
        "note": "claude.com DR; product page traffic"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "jules": {
      "founded": 1998,
      "employees": "183000",
      "hq": "Mountain View, United States",
      "linkedin": "http://www.linkedin.com/company/google",
      "last_round": "Part of Google",
      "ahrefs": {
        "dr": 71,
        "traffic": 3204,
        "refdomains": 3078,
        "brand_query": "google jules",
        "brand_us": 1300,
        "brand_global": 7800,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "mastra": {
      "ahrefs": {
        "dr": 77,
        "traffic": 7820,
        "refdomains": 6816,
        "brand_query": "mastra ai",
        "brand_us": 1500,
        "brand_global": 6800,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Ahrefs"
      ]
    },
    "buildful": {
      "ahrefs": {
        "dr": 4.9,
        "traffic": 0,
        "refdomains": 13,
        "brand_query": "buildful",
        "brand_us": 0,
        "brand_global": 20,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Ahrefs"
      ]
    },
    "codegen": {
      "founded": 2023,
      "employees": "13",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/trycodegen",
      "last_round": "$16M Seed (Thrive Capital, Mike Krieger), Nov 2023",
      "ahrefs": {
        "dr": 55,
        "traffic": 1872,
        "refdomains": 3681,
        "brand_query": "codegen ai",
        "brand_us": 60,
        "brand_global": 150,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "resolve": {
      "founded": 2024,
      "employees": "170",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/resolveai",
      "last_round": "$125M Series A (Greylock Partners, Lightspeed Venture Partners), Feb 2026",
      "ahrefs": {
        "dr": 64,
        "traffic": 2033,
        "refdomains": 2873,
        "brand_query": "resolve ai",
        "brand_us": 1200,
        "brand_global": 4900,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "incidentio": {
      "founded": 2021,
      "employees": "220",
      "hq": "San Francisco, United States",
      "linkedin": "https://www.linkedin.com/company/incident-io",
      "last_round": "$62M Series B (Insight Partners, Point Nine), Apr 2025",
      "founder": "Stephen Whitworth",
      "ahrefs": {
        "dr": 84,
        "traffic": 8195,
        "refdomains": 5970,
        "brand_query": "incident.io",
        "brand_us": 800,
        "brand_global": 1700,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "neubird": {
      "founded": 2023,
      "employees": "45",
      "hq": "Redwood City, United States",
      "linkedin": "https://www.linkedin.com/company/neubird-ai",
      "last_round": "Series A (Mayfield, M12), Apr 2026",
      "ahrefs": {
        "dr": 55,
        "traffic": 1048,
        "refdomains": 3090,
        "brand_query": "neubird",
        "brand_us": 500,
        "brand_global": 700,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "ciroos": {
      "founded": 2025,
      "employees": "60",
      "hq": "Pleasanton, United States",
      "linkedin": "https://www.linkedin.com/company/ciroos",
      "last_round": "$21M Seed (Energy Impact Partners), Jun 2025",
      "ahrefs": {
        "dr": 40,
        "traffic": 12,
        "refdomains": 2486,
        "brand_query": "ciroos",
        "brand_us": 250,
        "brand_global": 500,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "humanitec": {
      "founded": 2017,
      "employees": "26",
      "hq": "Berlin, Germany",
      "linkedin": "https://www.linkedin.com/company/humanitec",
      "last_round": "Seed (Greycroft Partners), Apr 2024",
      "ahrefs": {
        "dr": 66,
        "traffic": 1898,
        "refdomains": 2420,
        "brand_query": "humanitec",
        "brand_us": 250,
        "brand_global": 1300,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "spacelift": {
      "founded": 2020,
      "employees": "130",
      "hq": "Redwood City, United States",
      "linkedin": "https://www.linkedin.com/company/spacelift-io",
      "last_round": "$51M Series C (Inovo.vc, Five Elms Capital), Jul 2025",
      "founder": "Marcin Wyszynski",
      "ahrefs": {
        "dr": 75,
        "traffic": 53230,
        "refdomains": 8396,
        "brand_query": "spacelift",
        "brand_us": 1300,
        "brand_global": 4600,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    },
    "temporal": {
      "founded": 2019,
      "employees": "530",
      "hq": "Bellevue, United States",
      "linkedin": "https://www.linkedin.com/company/temporal-technologies",
      "last_round": "$550M Series E (Index Ventures, Lightspeed Venture Partners), Sep 2026",
      "founder": "Maxim Fateev",
      "ahrefs": {
        "dr": 79,
        "traffic": 39719,
        "refdomains": 8271,
        "brand_query": "temporal.io",
        "brand_us": 300,
        "brand_global": 1300,
        "as_of": "2026-11"
      },
      "data_sources": [
        "Apollo",
        "Ahrefs"
      ]
    }
  }
};

const OVERWRITE = new Set(['ahrefs', 'employees', 'last_round', 'linkedin', 'data_sources']);
const fill = (base: any, patch: Record<string, any>) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) if (OVERWRITE.has(k) || out[k] == null || out[k] === '') out[k] = v;
  return out;
};

/** Returns patched data, or null when nothing to do. */
export function applyDemoPatch(data: any): any | null {
  if ((data.demo_patch || 0) >= DEMO_PATCH.version) return null;
  return {
    ...data,
    demo_patch: DEMO_PATCH.version,
    client: fill(data.client, DEMO_PATCH.client),
    companies: (data.companies || []).map((c: any) => (DEMO_PATCH.companies[c.id] ? fill(c, DEMO_PATCH.companies[c.id]) : c)),
  };
}
