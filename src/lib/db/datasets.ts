import { DOKAN_SQL } from "./datasets/dokan";
import { SCHOOL_SQL } from "./datasets/school";

export type DatasetId = "dokan" | "school";

export interface Dataset {
  readonly id: DatasetId;
  readonly title: string;
  readonly description: string;
  readonly sql: string;
  /** dataset বদলালে editor-এ যে query বসে */
  readonly starter: string;
}

export const DATASETS: readonly Dataset[] = [
  {
    id: "dokan",
    title: "অনলাইন দোকান",
    description: "জেলা, গ্রাহক, পণ্য, অর্ডার আর অর্ডারের পণ্য।",
    sql: DOKAN_SQL,
    starter: "SELECT name, price\nFROM products\nWHERE price > 1000\nORDER BY price DESC;",
  },
  {
    id: "school",
    title: "স্কুল",
    description: "শ্রেণি, শিক্ষার্থী, বিষয় আর পরীক্ষার নম্বর।",
    sql: SCHOOL_SQL,
    starter: "SELECT s.name, r.marks\nFROM results r\nJOIN students s ON s.id = r.student_id\nWHERE r.exam = 'বার্ষিক' AND r.subject_id = 3\nORDER BY r.marks DESC\nLIMIT 5;",
  },
];

export const DEFAULT_DATASET: DatasetId = "dokan";

export const isDatasetId = (x: unknown): x is DatasetId => DATASETS.some((d) => d.id === x);

export const datasetById = (id: DatasetId): Dataset => DATASETS.find((d) => d.id === id) ?? DATASETS[0];
