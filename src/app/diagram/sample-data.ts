import * as go from 'gojs/release/go';
import { LinkData, NodeData } from './node-data';

/** One position in the sample company, with the people reporting to it. */
interface Position {
  role: string;
  name: string;
  comment?: string;
  reports?: Position[];
}

interface Department {
  color: string;
  head: Position;
}

// A small company: one chief executive and three departments of two teams each. It is meant for showing the tree layouts, not for load testing.
const CHIEF_EXECUTIVE = { role: 'Chief Executive Officer', name: 'Amara Okafor' };

const DEPARTMENTS: Department[] = [
  {
    color: '#bfdbfe',
    head: {
      role: 'Chief Technology Officer',
      name: 'Daniel Novak',
      reports: [
        {
          role: 'Platform Team Lead',
          name: 'Priya Raman',
          reports: [
            { role: 'Backend Engineer', name: 'Tomás Herrera' },
            { role: 'Backend Engineer', name: 'Mei Tanaka' },
            { role: 'DevOps Engineer', name: 'Jonas Lindqvist' },
          ],
        },
        {
          role: 'Web Team Lead',
          name: 'Sofia Marchetti',
          comment: 'Release checklist needs an owner for the mobile build.',
          reports: [
            { role: 'Frontend Engineer', name: 'Kwame Mensah' },
            { role: 'UX Designer', name: 'Noor Haddad' },
            { role: 'QA Engineer', name: 'Ana Sousa' },
          ],
        },
      ],
    },
  },
  {
    color: '#a7f3d0',
    head: {
      role: 'Chief Revenue Officer',
      name: 'Grace Lindholm',
      reports: [
        {
          role: 'Sales Manager',
          name: 'Mateo Rossi',
          reports: [
            { role: 'Account Executive', name: 'Ingrid Dahl' },
            { role: 'Account Executive', name: 'Diego Ramírez' },
            { role: 'Sales Development Rep', name: 'Hannah Kim' },
          ],
        },
        {
          role: 'Marketing Manager',
          name: 'Farah Siddiqui',
          reports: [
            { role: 'Content Strategist', name: 'Lucas Meyer' },
            { role: 'Campaign Specialist', name: 'Zanele Dube' },
          ],
        },
      ],
    },
  },
  {
    color: '#fed7aa',
    head: {
      role: 'Chief Operating Officer',
      name: 'Nadia Rahman',
      comment: 'Budget review for next quarter is due on Friday.',
      reports: [
        {
          role: 'Customer Support Lead',
          name: 'Oscar Nilsson',
          reports: [
            { role: 'Support Specialist', name: 'Leila Farouk' },
            { role: 'Support Specialist', name: 'Marco Bianchi' },
          ],
        },
        {
          role: 'Finance Manager',
          name: 'Isabel Castro',
          reports: [
            { role: 'Accountant', name: 'Peter Varga' },
            { role: 'Payroll Specialist', name: 'Aiko Mori' },
          ],
        },
      ],
    },
  },
];

/** Working relationships across departments, as pairs of people. */
const CROSS_LINKS: [from: string, to: string][] = [
  ['Sofia Marchetti', 'Farah Siddiqui'],
  ['Priya Raman', 'Oscar Nilsson'],
  ['Mateo Rossi', 'Isabel Castro'],
];

// Shape by rank: executives, people with reports, everyone else.
const EXECUTIVE_SHAPE = go.Figures.RoundedTopRectangle;
const LEAD_SHAPE = go.Figures.Rectangle;
const STAFF_SHAPE = go.Figures.RoundedRectangle;

/** The sample company as node and link data: reporting lines plus a few cross links. */
export function createOrgChart(): { nodes: NodeData[]; links: LinkData[] } {
  const nodes: NodeData[] = [];
  const links: LinkData[] = [];
  const keyOf = new Map<string, number>();

  const addNode = (position: Position, shape: go.FigureName, color: string): number => {
    const key = nodes.length + 1;
    keyOf.set(position.name, key);
    nodes.push({
      key,
      title: position.role,
      subtitle: position.name,
      shape,
      color,
      comment: position.comment ?? '',
    });
    return key;
  };
  const addLink = (from: number, to: number, category: LinkData['category']) =>
    links.push({ key: links.length + 1, from, to, category });

  const addReports = (boss: number, reports: Position[] | undefined, color: string) => {
    for (const report of reports ?? []) {
      const key = addNode(report, report.reports ? LEAD_SHAPE : STAFF_SHAPE, color);
      addLink(boss, key, 'hierarchy');
      addReports(key, report.reports, color);
    }
  };

  const chief = addNode(CHIEF_EXECUTIVE, EXECUTIVE_SHAPE, '#ddd6fe');
  for (const { head, color } of DEPARTMENTS) {
    const key = addNode(head, EXECUTIVE_SHAPE, color);
    addLink(chief, key, 'hierarchy');
    addReports(key, head.reports, color);
  }
  for (const [from, to] of CROSS_LINKS) {
    addLink(keyOf.get(from)!, keyOf.get(to)!, 'relation');
  }
  return { nodes, links };
}
