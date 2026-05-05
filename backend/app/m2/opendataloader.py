import opendataloader_pdf


opendataloader_pdf.convert(
    input_path=["exams/"],
    output_dir="output/",
    format="json",    
    keep_line_breaks = True,
    include_header_footer = False,
    image_dir = "crops",
    pages = "1-10"
)