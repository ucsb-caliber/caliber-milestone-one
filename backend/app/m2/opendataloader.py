import opendataloader_pdf

opendataloader_pdf.convert(
    input_path=["exams/practicefinal3.pdf"],
    output_dir="output/",
    format="json",    
    hybrid_mode="full",
    keep_line_breaks = True,
    include_header_footer = False
)