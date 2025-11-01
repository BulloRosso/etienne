#!/usr/bin/env python3
"""
Excel File Inspector
Description: Reads and displays the contents of sample_export.xlsx
Input: ../workspace/agent-sdk/.attachments/sample_export.xlsx
Output: Console output showing data structure and contents
"""

import pandas as pd
import sys
import os

# Path to the Excel file
excel_path = r'C:\Data\GitHub\claude-multitenant\workspace\agent-sdk\.attachments\sample_export.xlsx'

try:
    # Check if file exists
    if not os.path.exists(excel_path):
        print(f"Error: File not found at {excel_path}")
        sys.exit(1)

    # Read the Excel file
    print(f"Reading Excel file: {excel_path}\n")
    print("=" * 80)

    # Get all sheet names
    xl_file = pd.ExcelFile(excel_path)
    sheet_names = xl_file.sheet_names

    print(f"\nNumber of sheets: {len(sheet_names)}")
    print(f"Sheet names: {sheet_names}\n")
    print("=" * 80)

    # Read and display each sheet
    for sheet_name in sheet_names:
        print(f"\n\n{'='*80}")
        print(f"SHEET: {sheet_name}")
        print('='*80)

        df = pd.read_excel(excel_path, sheet_name=sheet_name)

        print(f"\nShape: {df.shape[0]} rows × {df.shape[1]} columns")
        print(f"\nColumn names and types:")
        for col in df.columns:
            print(f"  - {col}: {df[col].dtype}")

        print(f"\nFirst 10 rows:")
        print(df.head(10).to_string())

        print(f"\n\nBasic statistics:")
        print(df.describe(include='all').to_string())

        # Check for missing values
        missing = df.isnull().sum()
        if missing.any():
            print(f"\n\nMissing values:")
            print(missing[missing > 0].to_string())
        else:
            print(f"\n\nNo missing values found.")

    print("\n\n" + "="*80)
    print("Inspection complete!")
    print("="*80)

except Exception as e:
    print(f"Error reading Excel file: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
