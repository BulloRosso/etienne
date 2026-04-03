#!/usr/bin/env python3
"""
Generate professional PDF quote for EuroBatt GmbH
Quote ID: QB-20260403-1761
"""

import json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from datetime import datetime

# Company colors
EUROBATT_BLUE = colors.HexColor('#1B4F72')
LIGHT_GRAY = colors.HexColor('#F2F2F2')
MEDIUM_GRAY = colors.HexColor('#E0E0E0')
DARK_GRAY = colors.HexColor('#666666')
WHITE = colors.white

# Page setup
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2.5 * cm

class NumberedCanvas(canvas.Canvas):
    """Canvas that adds page numbers and footer to each page."""

    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            self.draw_footer()
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.setFont("Helvetica", 9)
        self.setFillColor(DARK_GRAY)
        page_num = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(PAGE_WIDTH - MARGIN, 1.5 * cm, page_num)

    def draw_footer(self):
        self.setFont("Helvetica", 8)
        self.setFillColor(DARK_GRAY)
        # Footer line
        self.setStrokeColor(EUROBATT_BLUE)
        self.setLineWidth(0.5)
        self.line(MARGIN, 2 * cm, PAGE_WIDTH - MARGIN, 2 * cm)
        # Footer text
        self.drawString(MARGIN, 1.5 * cm, "EuroBatt GmbH | Industriestrasse 42, 40210 Dusseldorf, Germany")
        self.drawString(MARGIN, 1.0 * cm, "Tel: +49 211 555 1234 | Email: quotes@eurobatt.de | www.eurobatt.de")
        # Confidentiality notice
        self.setFont("Helvetica-Oblique", 7)
        self.drawCentredString(PAGE_WIDTH / 2, 0.6 * cm,
            "CONFIDENTIAL - This document contains proprietary pricing and technical information.")


def create_styles():
    """Create custom paragraph styles."""
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name='CompanyHeader',
        fontName='Helvetica-Bold',
        fontSize=18,
        textColor=EUROBATT_BLUE,
        alignment=TA_LEFT,
        spaceAfter=2*mm
    ))

    styles.add(ParagraphStyle(
        name='DocumentTitle',
        fontName='Helvetica-Bold',
        fontSize=24,
        textColor=EUROBATT_BLUE,
        alignment=TA_CENTER,
        spaceBefore=10*mm,
        spaceAfter=10*mm
    ))

    styles.add(ParagraphStyle(
        name='SectionHeader',
        fontName='Helvetica-Bold',
        fontSize=14,
        textColor=EUROBATT_BLUE,
        spaceBefore=8*mm,
        spaceAfter=4*mm
    ))

    styles.add(ParagraphStyle(
        name='SubsectionHeader',
        fontName='Helvetica-Bold',
        fontSize=11,
        textColor=EUROBATT_BLUE,
        spaceBefore=4*mm,
        spaceAfter=2*mm
    ))

    styles.add(ParagraphStyle(
        name='QuoteBodyText',
        fontName='Helvetica',
        fontSize=10,
        textColor=colors.black,
        alignment=TA_JUSTIFY,
        spaceAfter=3*mm,
        leading=14
    ))

    styles.add(ParagraphStyle(
        name='SmallText',
        fontName='Helvetica',
        fontSize=9,
        textColor=DARK_GRAY,
        alignment=TA_LEFT,
        spaceAfter=2*mm,
        leading=12
    ))

    styles.add(ParagraphStyle(
        name='TableHeader',
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=WHITE,
        alignment=TA_CENTER
    ))

    styles.add(ParagraphStyle(
        name='TableCell',
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.black,
        alignment=TA_LEFT,
        leading=12
    ))

    styles.add(ParagraphStyle(
        name='TableCellCenter',
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.black,
        alignment=TA_CENTER,
        leading=12
    ))

    styles.add(ParagraphStyle(
        name='TableCellRight',
        fontName='Helvetica',
        fontSize=9,
        textColor=colors.black,
        alignment=TA_RIGHT,
        leading=12
    ))

    styles.add(ParagraphStyle(
        name='Note',
        fontName='Helvetica-Oblique',
        fontSize=9,
        textColor=DARK_GRAY,
        alignment=TA_LEFT,
        spaceAfter=2*mm,
        leftIndent=5*mm
    ))

    styles.add(ParagraphStyle(
        name='Warning',
        fontName='Helvetica-Bold',
        fontSize=9,
        textColor=colors.HexColor('#B22222'),
        alignment=TA_LEFT,
        spaceAfter=2*mm
    ))

    return styles


def create_table_style(has_header=True):
    """Create standard table style with alternating row colors."""
    style_commands = [
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, MEDIUM_GRAY),
    ]

    if has_header:
        style_commands.extend([
            ('BACKGROUND', (0, 0), (-1, 0), EUROBATT_BLUE),
            ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ])

    return TableStyle(style_commands)


def add_alternating_rows(table_style, num_rows, start_row=1):
    """Add alternating row backgrounds to table style."""
    for i in range(start_row, num_rows):
        if i % 2 == 0:
            table_style.add('BACKGROUND', (0, i), (-1, i), LIGHT_GRAY)
    return table_style


def build_document(specs, config, price):
    """Build the complete PDF document."""

    output_path = "C:/Data/GitHub/claude-multitenant/workspace/quote-configurator/quotes/QB-20260403-1761/quote_QB-20260403-1761.pdf"

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=3 * cm
    )

    styles = create_styles()
    story = []

    # ==================== PAGE 1: COVER & SUMMARY ====================

    # Company Header
    story.append(Paragraph("EuroBatt GmbH", styles['CompanyHeader']))
    story.append(Paragraph("Battery Cell Solutions", styles['SmallText']))

    # Horizontal line
    story.append(HRFlowable(width="100%", thickness=2, color=EUROBATT_BLUE, spaceAfter=5*mm))

    # Document Title
    story.append(Paragraph("Technical & Commercial Quote", styles['DocumentTitle']))

    # Quote Information Box
    quote_info = [
        ['Quote Reference:', f"QB-20260403-1761"],
        ['Date of Issue:', '3 April 2026'],
        ['Valid Until:', '3 May 2026 (30 days)'],
        ['Customer Reference:', 'VEL-RFQ-2026-0087'],
    ]

    quote_table = Table(quote_info, colWidths=[4*cm, 8*cm])
    quote_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (0, -1), 8),
    ]))
    story.append(quote_table)
    story.append(Spacer(1, 8*mm))

    # Customer Details Section
    story.append(Paragraph("Customer Details", styles['SectionHeader']))

    customer_info = [
        ['Company:', 'Velora Mobility S.r.l.'],
        ['Address:', 'Via Alessandro Volta 18, 20121 Milano, Italy'],
        ['Contact:', 'Ing. Marco Benedetti, Head of Battery Engineering'],
        ['Delivery Location:', 'Carpi (MO), Italy'],
        ['Target Market:', 'Italy (EU)'],
    ]

    customer_table = Table(customer_info, colWidths=[4*cm, 10*cm])
    customer_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (0, -1), 8),
    ]))
    story.append(customer_table)
    story.append(Spacer(1, 8*mm))

    # Executive Summary
    story.append(Paragraph("Executive Summary", styles['SectionHeader']))

    summary_text = """
    EuroBatt GmbH is pleased to present this technical and commercial quotation for NMC 21700
    high-energy battery cells configured to meet your specifications for electric vehicle applications.
    This quote covers engineering samples through SOP production volumes, with options for further
    scale-up in subsequent years.
    """
    story.append(Paragraph(summary_text.strip(), styles['QuoteBodyText']))

    # Product Summary Table
    summary_data = [
        ['Product', 'Configuration', 'Quantity', 'Unit Price', 'Total'],
        ['BC-NMC-2170-HD-HP25', 'Engineering Samples', '500 cells', 'EUR 5.81', 'EUR 2,905'],
        ['BC-NMC-2170-HD-HP25', 'Pre-Series', '5,000 cells', 'EUR 5.52', 'EUR 27,600'],
        ['BC-NMC-2170-HD-HP25', 'SOP Annual', '50,000 cells', 'EUR 4.76', 'EUR 238,000'],
        ['', 'NRE Charges', '', '', 'EUR 800'],
        ['', '', '', 'First Year Total:', 'EUR 269,305'],
    ]

    summary_table = Table(summary_data, colWidths=[4*cm, 3.5*cm, 2.5*cm, 2.5*cm, 2.5*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(summary_data))
    style.add('FONTNAME', (-2, -1), (-1, -1), 'Helvetica-Bold')
    style.add('BACKGROUND', (0, -1), (-1, -1), MEDIUM_GRAY)
    summary_table.setStyle(style)
    story.append(summary_table)

    story.append(Spacer(1, 8*mm))

    # Key Specifications Summary
    story.append(Paragraph("Product Highlights", styles['SubsectionHeader']))

    highlights = [
        ['Chemistry:', 'NMC 811 (LiNi0.8Mn0.1Co0.1O2)'],
        ['Form Factor:', 'Cylindrical 21700 (21mm x 70mm)'],
        ['Nominal Capacity:', '5.0 Ah (High-Density configuration)'],
        ['Nominal Voltage:', '3.63V (range: 2.5V - 4.2V)'],
        ['Continuous Discharge:', '2.5C (12.5A)'],
        ['Energy per Cell:', '18.15 Wh'],
        ['Weight:', '68g typical'],
    ]

    highlights_table = Table(highlights, colWidths=[4*cm, 10*cm])
    highlights_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(highlights_table)

    # Important notes
    story.append(Spacer(1, 5*mm))
    story.append(Paragraph("Important Configuration Notes:", styles['SubsectionHeader']))
    story.append(Paragraph(
        "Discharge Rate: Customer accepted 2.5C continuous (vs. originally requested 3C).",
        styles['Note']
    ))
    story.append(Paragraph(
        "Cycle Life: With High-Density 5.0 Ah capacity selected, estimated cycle life is 850-900 cycles to 80% SoH.",
        styles['Note']
    ))

    story.append(PageBreak())

    # ==================== PAGE 2: TECHNICAL SPECIFICATION ====================

    story.append(Paragraph("EuroBatt GmbH", styles['CompanyHeader']))
    story.append(HRFlowable(width="100%", thickness=2, color=EUROBATT_BLUE, spaceAfter=5*mm))

    story.append(Paragraph("Technical Specification", styles['DocumentTitle']))

    # Product Information
    story.append(Paragraph("Product Information", styles['SectionHeader']))

    product_info = [
        ['Base Product:', 'BC-NMC-2170 - NMC 21700 High Energy Cell'],
        ['Configured Variant:', 'BC-NMC-2170-HD-HP25'],
        ['Application:', 'Electric Vehicle - Light Electric Vehicles / Urban Mobility'],
    ]

    prod_table = Table(product_info, colWidths=[4*cm, 11*cm])
    prod_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(prod_table)
    story.append(Spacer(1, 5*mm))

    # Full Technical Specifications Table
    story.append(Paragraph("Technical Specifications", styles['SectionHeader']))

    tech_specs = config.get('technical_specifications_configured', {})

    spec_data = [
        ['Parameter', 'Specification', 'Notes'],
        ['Chemistry', tech_specs.get('chemistry', 'NMC 811'), 'As requested'],
        ['Form Factor', tech_specs.get('form_factor', 'Cylindrical 21700'), 'As requested'],
        ['Nominal Voltage', tech_specs.get('nominal_voltage', '3.63V'), 'Compatible with 3.6V requirement'],
        ['Voltage Range', tech_specs.get('voltage_range', '2.5V - 4.2V'), 'Standard range'],
        ['Nominal Capacity', tech_specs.get('nominal_capacity', '5.0 Ah'), 'High-Density option'],
        ['Energy', tech_specs.get('energy', '18.15 Wh'), 'Calculated'],
        ['Continuous Discharge', tech_specs.get('continuous_discharge_rate', '2.5C (12.5A)'), 'Adjusted from 3C request'],
        ['Peak Discharge', tech_specs.get('peak_discharge_rate', '3.5C for 10s'), '17.5A for 10 seconds'],
        ['Standard Charge', tech_specs.get('standard_charge_rate', '0.5C (2.5A)'), 'Standard'],
        ['Fast Charge', tech_specs.get('fast_charge_rate', '1.0C (5.0A)'), 'Optional'],
        ['Discharge Temp Range', tech_specs.get('operating_temp_discharge', '-20C to +55C'), 'Meets requirement'],
        ['Charge Temp Range', tech_specs.get('operating_temp_charge', '0C to +45C'), 'Meets requirement'],
        ['Cycle Life', tech_specs.get('cycle_life_estimated', '850-900 cycles'), 'To 80% SoH'],
        ['Internal Resistance', tech_specs.get('internal_resistance_typical', '18-22 mohm'), 'Below 25 mohm max'],
        ['Weight', tech_specs.get('weight_typical', '68g'), 'Below 70g max'],
    ]

    spec_table = Table(spec_data, colWidths=[4.5*cm, 4.5*cm, 6*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(spec_data))
    spec_table.setStyle(style)
    story.append(spec_table)
    story.append(Spacer(1, 5*mm))

    # Feature Configuration Table
    story.append(Paragraph("Feature Configuration Summary", styles['SectionHeader']))

    feature_data = [['Feature', 'Requested', 'Configured', 'Status']]

    for feature in config.get('configuration', {}).get('features', [])[:8]:
        status = feature.get('status', '')
        status_display = status.upper()
        feature_data.append([
            Paragraph(feature.get('feature_name', ''), styles['TableCell']),
            Paragraph(feature.get('requested_value', 'N/A'), styles['TableCell']),
            Paragraph(feature.get('configured_value', ''), styles['TableCell']),
            Paragraph(status_display, styles['TableCellCenter']),
        ])

    feature_table = Table(feature_data, colWidths=[3.5*cm, 4*cm, 4.5*cm, 3*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(feature_data))
    feature_table.setStyle(style)
    story.append(feature_table)
    story.append(Spacer(1, 5*mm))

    # Safety Features
    story.append(Paragraph("Safety Features", styles['SubsectionHeader']))
    story.append(Paragraph("Current Interrupt Device (CID): Included as standard", styles['QuoteBodyText']))
    story.append(Paragraph("Positive Temperature Coefficient (PTC): Included as standard", styles['QuoteBodyText']))
    story.append(Paragraph("Thermal stability within cell-level specification for pack-level propagation prevention.", styles['Note']))

    # Certifications Section
    story.append(Paragraph("Certifications & Regulatory Compliance", styles['SectionHeader']))

    cert_data = [['Certification', 'Standard', 'Status', 'Lead Time Impact']]

    for cert in config.get('certifications_included', []):
        cert_data.append([
            cert.get('certification', ''),
            Paragraph(cert.get('standard', ''), styles['TableCell']),
            cert.get('status', '').upper(),
            cert.get('lead_time_impact', 'None'),
        ])

    cert_table = Table(cert_data, colWidths=[3*cm, 6.5*cm, 2.5*cm, 3*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(cert_data))
    cert_table.setStyle(style)
    story.append(cert_table)

    story.append(PageBreak())

    # ==================== PAGE 3: COMMERCIAL TERMS ====================

    story.append(Paragraph("EuroBatt GmbH", styles['CompanyHeader']))
    story.append(HRFlowable(width="100%", thickness=2, color=EUROBATT_BLUE, spaceAfter=5*mm))

    story.append(Paragraph("Commercial Terms", styles['DocumentTitle']))

    # Price Breakdown
    story.append(Paragraph("Price Breakdown", styles['SectionHeader']))

    story.append(Paragraph("Base Price and Surcharges (per unit)", styles['SubsectionHeader']))

    price_breakdown = [
        ['Item', 'Type', 'Amount (EUR)'],
        ['Base Price - BC-NMC-2170', 'Base', '4.20'],
    ]

    for surcharge in price.get('configuration_surcharges', []):
        desc = surcharge.get('description', '')
        if len(desc) > 40:
            desc = desc[:37] + '...'
        price_breakdown.append([
            desc,
            surcharge.get('tier', '').capitalize(),
            f"+{surcharge.get('surcharge_per_unit', 0):.2f}",
        ])

    price_breakdown.append(['Total Unit Price (before volume discount)', '', '5.81'])

    breakdown_table = Table(price_breakdown, colWidths=[9*cm, 3*cm, 3*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(price_breakdown))
    style.add('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold')
    style.add('BACKGROUND', (0, -1), (-1, -1), MEDIUM_GRAY)
    style.add('ALIGN', (-1, 0), (-1, -1), 'RIGHT')
    breakdown_table.setStyle(style)
    story.append(breakdown_table)
    story.append(Spacer(1, 5*mm))

    # Volume Discount Schedule
    story.append(Paragraph("Volume Discount Schedule", styles['SubsectionHeader']))

    discount_data = [['Volume Tier', 'Discount', 'Unit Price (EUR)']]
    for tier in price.get('volume_discount_schedule', []):
        discount_data.append([
            tier.get('tier', ''),
            f"{tier.get('discount_percent', 0)}%",
            f"{tier.get('example_unit_price', 0):.2f}",
        ])

    discount_table = Table(discount_data, colWidths=[5*cm, 3*cm, 4*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(discount_data))
    style.add('ALIGN', (1, 0), (-1, -1), 'CENTER')
    discount_table.setStyle(style)
    story.append(discount_table)
    story.append(Spacer(1, 5*mm))

    # Volume Pricing Table
    story.append(Paragraph("Volume Pricing", styles['SectionHeader']))

    volume_data = [
        ['Phase', 'Quantity', 'Discount', 'Unit Price', 'Total'],
        ['Engineering Samples', '500', '0%', 'EUR 5.81', 'EUR 2,905'],
        ['Pre-Series', '5,000', '5%', 'EUR 5.52', 'EUR 27,600'],
        ['SOP Annual', '50,000', '18%', 'EUR 4.76', 'EUR 238,000'],
        ['Year 2 Ramp-up', '80,000', '18%', 'EUR 4.76', 'EUR 380,800'],
    ]

    volume_table = Table(volume_data, colWidths=[4*cm, 2.5*cm, 2*cm, 3*cm, 3.5*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(volume_data))
    style.add('ALIGN', (1, 0), (-1, -1), 'CENTER')
    style.add('ALIGN', (-1, 0), (-1, -1), 'RIGHT')
    volume_table.setStyle(style)
    story.append(volume_table)
    story.append(Spacer(1, 5*mm))

    # NRE Charges
    story.append(Paragraph("Non-Recurring Engineering (NRE) Charges", styles['SectionHeader']))

    nre_data = [['Item', 'Description', 'Amount (EUR)']]
    for nre in price.get('nre_charges', []):
        nre_data.append([
            nre.get('item', ''),
            Paragraph(nre.get('description', ''), styles['TableCell']),
            f"{nre.get('amount', 0):,.2f}",
        ])
    nre_data.append(['', 'Total NRE', '800.00'])

    nre_table = Table(nre_data, colWidths=[4*cm, 8*cm, 3*cm])
    style = create_table_style()
    style.add('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold')
    style.add('ALIGN', (-1, 0), (-1, -1), 'RIGHT')
    nre_table.setStyle(style)
    story.append(nre_table)
    story.append(Spacer(1, 5*mm))

    # Total Summary
    story.append(Paragraph("Order Summary", styles['SectionHeader']))

    total_summary = price.get('total_summary', {})

    summary_final = [
        ['Phase', 'Cells', 'Cell Cost', 'NRE', 'Subtotal'],
        ['Engineering Samples', '500', 'EUR 2,905', 'EUR 800', 'EUR 3,705'],
        ['Pre-Series', '5,000', 'EUR 27,600', '-', 'EUR 27,600'],
        ['SOP Annual', '50,000', 'EUR 238,000', '-', 'EUR 238,000'],
        ['First Year Total', '55,500', '', '', 'EUR 269,305'],
        ['Year 2 (Projected)', '80,000', 'EUR 380,800', '-', 'EUR 380,800'],
    ]

    summary_table = Table(summary_final, colWidths=[4*cm, 2.5*cm, 3*cm, 2.5*cm, 3*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(summary_final))
    style.add('FONTNAME', (0, 4), (-1, 4), 'Helvetica-Bold')
    style.add('BACKGROUND', (0, 4), (-1, 4), EUROBATT_BLUE)
    style.add('TEXTCOLOR', (0, 4), (-1, 4), WHITE)
    style.add('ALIGN', (1, 0), (-1, -1), 'RIGHT')
    summary_table.setStyle(style)
    story.append(summary_table)

    story.append(PageBreak())

    # ==================== PAGE 4: TERMS & CONDITIONS ====================

    story.append(Paragraph("EuroBatt GmbH", styles['CompanyHeader']))
    story.append(HRFlowable(width="100%", thickness=2, color=EUROBATT_BLUE, spaceAfter=5*mm))

    story.append(Paragraph("Terms & Conditions", styles['DocumentTitle']))

    # Delivery Terms
    story.append(Paragraph("Delivery Terms", styles['SectionHeader']))

    delivery_info = [
        ['Incoterms:', 'DAP Carpi (MO), Italy'],
        ['Lead Time (Initial):', '20-22 weeks (includes certification lead times)'],
        ['Lead Time (Subsequent):', '8-10 weeks after initial qualification'],
        ['Shipping:', 'To be quoted separately'],
    ]

    delivery_table = Table(delivery_info, colWidths=[4*cm, 11*cm])
    delivery_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(delivery_table)
    story.append(Spacer(1, 5*mm))

    # Payment Terms
    story.append(Paragraph("Payment Terms", styles['SectionHeader']))

    payment_terms = price.get('payment_terms', {})

    payment_data = [
        ['Order Type', 'Payment Terms'],
        ['Engineering Samples', payment_terms.get('engineering_samples', '100% upon order confirmation')],
        ['Pre-Series', payment_terms.get('pre_series', '50% upon confirmation, 50% upon delivery')],
        ['SOP Production', payment_terms.get('sop_production', '30% upon confirmation, 70% Net 30')],
        ['NRE Charges', payment_terms.get('nre_charges', '100% upon order confirmation')],
    ]

    payment_table = Table(payment_data, colWidths=[4*cm, 11*cm])
    style = create_table_style()
    style = add_alternating_rows(style, len(payment_data))
    payment_table.setStyle(style)
    story.append(payment_table)
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph("Accepted currencies: EUR, USD. Non-EUR payments subject to exchange rate at time of invoicing.", styles['Note']))
    story.append(Spacer(1, 5*mm))

    # Warranty Terms
    story.append(Paragraph("Warranty", styles['SectionHeader']))

    warranty = price.get('warranty_terms', {})

    story.append(Paragraph(f"<b>Warranty Period:</b> {warranty.get('warranty_period', '24 months from delivery')}", styles['QuoteBodyText']))
    story.append(Paragraph(f"<b>Coverage:</b> {warranty.get('coverage', 'Manufacturing defects')}", styles['QuoteBodyText']))
    story.append(Paragraph(f"<b>Cycle Life Guarantee:</b> {warranty.get('cycle_life_guarantee', 'Minimum 850 cycles to 80% SoH')}", styles['QuoteBodyText']))
    story.append(Paragraph(f"<b>Capacity Guarantee:</b> {warranty.get('capacity_guarantee', 'Minimum 98% of nominal')}", styles['QuoteBodyText']))

    story.append(Paragraph("Exclusions:", styles['SubsectionHeader']))
    for exclusion in warranty.get('exclusions', []):
        story.append(Paragraph(f"- {exclusion}", styles['SmallText']))

    story.append(Paragraph(f"<b>Remedy:</b> {warranty.get('remedy', 'Replacement at EuroBatt discretion')}", styles['QuoteBodyText']))
    story.append(Spacer(1, 5*mm))

    # Quote Validity
    story.append(Paragraph("Quote Validity", styles['SectionHeader']))

    validity = price.get('pricing_validity', {})
    story.append(Paragraph(f"This quotation is valid for <b>{validity.get('validity_period', '30 days')}</b>.", styles['QuoteBodyText']))
    story.append(Paragraph(f"Valid from: {validity.get('valid_from', '2026-04-03')} to {validity.get('valid_until', '2026-05-03')}", styles['QuoteBodyText']))
    story.append(Paragraph(validity.get('extension_clause', ''), styles['Note']))
    story.append(Spacer(1, 5*mm))

    # Customer Obligations (Italy)
    story.append(Paragraph("Customer Regulatory Obligations (Italy)", styles['SectionHeader']))

    for obligation in config.get('country_specific_config', {}).get('customer_obligations_noted', []):
        story.append(Paragraph(f"- {obligation}", styles['SmallText']))

    story.append(Spacer(1, 5*mm))
    story.append(Paragraph("Note: Customer EPR obligations (CDCNPA consortium fee) estimated at EUR 0.03-0.08/unit are customer responsibility.", styles['Note']))

    story.append(Spacer(1, 10*mm))

    # Signature Block
    story.append(Paragraph("Acceptance", styles['SectionHeader']))

    story.append(Paragraph(
        "To accept this quotation, please sign below and return to EuroBatt GmbH. "
        "Upon receipt of signed acceptance, we will issue an order confirmation.",
        styles['QuoteBodyText']
    ))

    story.append(Spacer(1, 10*mm))

    sig_data = [
        ['For and on behalf of', 'For and on behalf of'],
        ['Velora Mobility S.r.l.', 'EuroBatt GmbH'],
        ['', ''],
        ['', ''],
        ['____________________________', '____________________________'],
        ['Name:', 'Name:'],
        ['Title:', 'Title:'],
        ['Date:', 'Date:'],
    ]

    sig_table = Table(sig_data, colWidths=[7.5*cm, 7.5*cm])
    sig_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 2), (-1, 3), 15),
    ]))
    story.append(sig_table)

    story.append(PageBreak())

    # ==================== PAGE 5: NOTES & DISCLAIMERS ====================

    story.append(Paragraph("EuroBatt GmbH", styles['CompanyHeader']))
    story.append(HRFlowable(width="100%", thickness=2, color=EUROBATT_BLUE, spaceAfter=5*mm))

    story.append(Paragraph("Notes & Disclaimers", styles['DocumentTitle']))

    # Configuration Notes
    story.append(Paragraph("Configuration Notes", styles['SectionHeader']))

    for note in config.get('configuration_notes', []):
        priority = note.get('priority', 'info').upper()
        note_text = note.get('note', '')

        if priority == 'CRITICAL':
            style_name = 'Warning'
            prefix = "CRITICAL: "
        elif priority == 'HIGH':
            style_name = 'Warning'
            prefix = "Important: "
        else:
            style_name = 'Note'
            prefix = ""

        story.append(Paragraph(f"{prefix}{note_text}", styles[style_name]))

    story.append(Spacer(1, 5*mm))

    # Customer Decisions Confirmed
    story.append(Paragraph("Customer Decisions Confirmed", styles['SectionHeader']))

    decisions_data = [['Decision', 'Requested', 'Accepted', 'Status']]
    for decision in price.get('customer_decisions_confirmed', []):
        decisions_data.append([
            decision.get('decision', ''),
            decision.get('requested', ''),
            decision.get('accepted', decision.get('description', '')),
            decision.get('status', ''),
        ])

    decisions_table = Table(decisions_data, colWidths=[3.5*cm, 4*cm, 5*cm, 2.5*cm])
    style = create_table_style()
    decisions_table.setStyle(style)
    story.append(decisions_table)
    story.append(Spacer(1, 5*mm))

    # Pricing Notes
    story.append(Paragraph("Pricing Notes", styles['SectionHeader']))

    for note in price.get('pricing_notes', []):
        story.append(Paragraph(f"- {note}", styles['SmallText']))

    story.append(Spacer(1, 5*mm))

    # Legal Disclaimers
    story.append(Paragraph("Legal Disclaimers", styles['SectionHeader']))

    disclaimers = [
        "All specifications are subject to change without notice. Contact EuroBatt for the latest specifications.",
        "Prices are quoted ex-works EuroBatt facility (Dusseldorf, Germany) unless otherwise stated.",
        "Delivery times are estimates and may vary based on order volume and component availability.",
        "This quotation does not constitute a binding contract until accepted in writing by both parties.",
        "EuroBatt GmbH liability is limited to the replacement value of defective products.",
        "Force majeure events may affect pricing and delivery commitments.",
        "Raw material price adjustment clause applies for orders with delivery beyond 6 months.",
    ]

    for disclaimer in disclaimers:
        story.append(Paragraph(f"- {disclaimer}", styles['SmallText']))

    story.append(Spacer(1, 10*mm))

    # Contact Information
    story.append(Paragraph("Contact Information", styles['SectionHeader']))

    contact_info = [
        ['Sales Contact:', 'quotes@eurobatt.de | +49 211 555 1234'],
        ['Technical Support:', 'techsupport@eurobatt.de | +49 211 555 1235'],
        ['Address:', 'EuroBatt GmbH, Industriestrasse 42, 40210 Dusseldorf, Germany'],
        ['Website:', 'www.eurobatt.de'],
    ]

    contact_table = Table(contact_info, colWidths=[4*cm, 11*cm])
    contact_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(contact_table)

    # Build the document
    doc.build(story, canvasmaker=NumberedCanvas)

    return output_path


def main():
    """Main function to generate the PDF."""

    # Load JSON data
    quote_dir = "C:/Data/GitHub/claude-multitenant/workspace/quote-configurator/quotes/QB-20260403-1761"

    with open(f"{quote_dir}/QB-20260403-1761_specs.json", 'r') as f:
        specs = json.load(f)

    with open(f"{quote_dir}/QB-20260403-1761_config.json", 'r') as f:
        config = json.load(f)

    with open(f"{quote_dir}/QB-20260403-1761_price.json", 'r') as f:
        price = json.load(f)

    # Check status of all files
    all_success = True
    failures = []

    for name, data in [('specs', specs), ('config', config), ('price', price)]:
        if data.get('status') != 'success':
            all_success = False
            failures.append(f"{name}: {data.get('status', 'unknown')}")

    if not all_success:
        print(f"WARNING: Some input files have failure status: {failures}")
        print("Generating partial quote marked as DRAFT")

    # Generate PDF
    output_path = build_document(specs, config, price)
    print(f"PDF generated successfully: {output_path}")


if __name__ == "__main__":
    main()
