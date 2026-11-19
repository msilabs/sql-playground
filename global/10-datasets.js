// নমুনা ডেটার পরিচয়। SQL নিজে থাকে public/sql/datasets.js-এ, শুধু worker সেটা পড়ে।
(function (root) {
    const DATASETS = [
        {
            id: "dokan",
            title: "অনলাইন দোকান",
            description: "জেলা, গ্রাহক, পণ্য, অর্ডার আর অর্ডারের পণ্য।",
            starter: "SELECT name, price\nFROM products\nWHERE price > 1000\nORDER BY price DESC;",
        },
        {
            id: "school",
            title: "স্কুল",
            description: "শ্রেণি, শিক্ষার্থী, বিষয় আর পরীক্ষার নম্বর।",
            starter: "SELECT s.name, r.marks\nFROM results r\nJOIN students s ON s.id = r.student_id\nWHERE r.exam = 'বার্ষিক' AND r.subject_id = 3\nORDER BY r.marks DESC\nLIMIT 5;",
        },
    ];
    const DEFAULT_DATASET = "dokan";
    const isDatasetId = (x) => DATASETS.some((d) => d.id === x);
    const datasetById = (id) => DATASETS.find((d) => d.id === id) ?? DATASETS[0];

    var api = { DATASETS: DATASETS, DEFAULT_DATASET: DEFAULT_DATASET, isDatasetId: isDatasetId, datasetById: datasetById };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.SqlDatasets = api;
})(typeof self !== 'undefined' ? self : this);
