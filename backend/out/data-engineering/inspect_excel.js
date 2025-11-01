#!/usr/bin/env node
/**
 * Excel File Inspector
 * Description: Reads and displays the contents of sample_export.xlsx
 * Input: workspace/agent-sdk/.attachments/sample_export.xlsx
 * Output: Console output showing data structure and contents
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Path to the Excel file
const excelPath = path.join('C:', 'Data', 'GitHub', 'claude-multitenant', 'workspace', 'agent-sdk', '.attachments', 'sample_export.xlsx');

try {
    // Check if file exists
    if (!fs.existsSync(excelPath)) {
        console.error(`Error: File not found at ${excelPath}`);
        process.exit(1);
    }

    console.log(`Reading Excel file: ${excelPath}\n`);
    console.log('='.repeat(80));

    // Read the Excel file
    const workbook = XLSX.readFile(excelPath);

    // Get all sheet names
    const sheetNames = workbook.SheetNames;

    console.log(`\nNumber of sheets: ${sheetNames.length}`);
    console.log(`Sheet names: ${sheetNames.join(', ')}\n`);
    console.log('='.repeat(80));

    // Process each sheet
    sheetNames.forEach((sheetName) => {
        console.log('\n\n' + '='.repeat(80));
        console.log(`SHEET: ${sheetName}`);
        console.log('='.repeat(80));

        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON to analyze data
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
            console.log('\n(Empty sheet)');
            return;
        }

        console.log(`\nShape: ${jsonData.length} rows × ${jsonData[0]?.length || 0} columns`);

        // Display headers (first row)
        if (jsonData.length > 0) {
            console.log('\nColumn headers:');
            jsonData[0].forEach((header, idx) => {
                console.log(`  ${idx + 1}. ${header}`);
            });
        }

        // Display first 10 rows
        console.log('\n\nFirst 10 rows:');
        const rowsToShow = Math.min(10, jsonData.length);
        for (let i = 0; i < rowsToShow; i++) {
            console.log(`\nRow ${i + 1}:`);
            const row = jsonData[i];
            row.forEach((cell, idx) => {
                const header = jsonData[0]?.[idx] || `Column ${idx + 1}`;
                console.log(`  ${header}: ${cell}`);
            });
        }

        // Convert to JSON with headers for better analysis
        const jsonWithHeaders = XLSX.utils.sheet_to_json(worksheet);

        if (jsonWithHeaders.length > 0) {
            console.log('\n\nSample data (JSON format):');
            console.log(JSON.stringify(jsonWithHeaders.slice(0, 5), null, 2));

            console.log(`\n\nTotal data rows (excluding header): ${jsonWithHeaders.length}`);
        }
    });

    console.log('\n\n' + '='.repeat(80));
    console.log('Inspection complete!');
    console.log('='.repeat(80));

} catch (error) {
    console.error(`Error reading Excel file: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
}
