import json
import os
import glob
from fpdf import FPDF, XPos, YPos

class ResumePDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-15)
        self.set_font("helvetica", "I", 8)
        self.cell(0, 10, f"Page {self.page_no()}", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

def create_resume_pdf(resume_data, output_path):
    pdf = ResumePDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Title / Name
    pdf.set_font("helvetica", "B", 20)
    # Handle unicode characters (fpdf2 supports utf-8 but default helvetica might lack some chars)
    # We will just replace non-ascii chars if needed, or stick to basic for now
    pdf.cell(0, 10, resume_data.get('fullName', ''), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    
    # Contact Info
    pdf.set_font("helvetica", "", 10)
    contact_info = []
    if resume_data.get('email'): contact_info.append(resume_data['email'])
    if resume_data.get('phone'): contact_info.append(resume_data['phone'])
    if resume_data.get('location'): contact_info.append(resume_data['location'])
    if contact_info:
        pdf.cell(0, 6, " | ".join(contact_info), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    
    links = []
    if resume_data.get('linkedin'): links.append(resume_data['linkedin'])
    if resume_data.get('github'): links.append(resume_data['github'])
    if links:
        pdf.cell(0, 6, " | ".join(links), align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(5)

    def add_section_header(title):
        pdf.set_font("helvetica", "B", 14)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(0, 8, title, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(2)

    # Professional Summary
    summary = resume_data.get('professionalSummary', [])
    if summary:
        add_section_header("Professional Summary")
        pdf.set_font("helvetica", "", 11)
        for line in summary:
            # multi_cell uses w, h, text
            pdf.multi_cell(0, 6, f"- {line}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(5)

    # Skills
    skills = resume_data.get('skills', {})
    if skills:
        add_section_header("Skills")
        for category, skill_list in skills.items():
            pdf.set_font("helvetica", "B", 11)
            pdf.cell(0, 6, category.title() + ": ", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("helvetica", "", 11)
            pdf.multi_cell(0, 6, ", ".join(skill_list), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2)
        pdf.ln(3)

    # Work Experience
    experience = resume_data.get('workExperience', [])
    if experience:
        add_section_header("Work Experience")
        for exp in experience:
            pdf.set_font("helvetica", "B", 12)
            pdf.cell(0, 6, f"{exp.get('jobTitle', '')} at {exp.get('company', '')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("helvetica", "I", 10)
            pdf.cell(0, 6, f"{exp.get('location', '')} | {exp.get('startDate', '')} - {exp.get('endDate', '')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("helvetica", "", 11)
            for ach in exp.get('achievements', []):
                pdf.multi_cell(0, 6, f"- {ach}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(3)
        pdf.ln(2)

    # Projects
    projects = resume_data.get('projects', [])
    if projects:
        add_section_header("Projects")
        for proj in projects:
            pdf.set_font("helvetica", "B", 12)
            pdf.cell(0, 6, proj.get('name', ''), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("helvetica", "I", 10)
            pdf.cell(0, 6, "Tech Stack: " + ", ".join(proj.get('techStack', [])), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("helvetica", "", 11)
            pdf.multi_cell(0, 6, proj.get('description', ''), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(3)
        pdf.ln(2)

    # Education
    education = resume_data.get('education', [])
    if education:
        add_section_header("Education")
        for edu in education:
            pdf.set_font("helvetica", "B", 12)
            pdf.cell(0, 6, f"{edu.get('degree', '')} - {edu.get('institution', '')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.set_font("helvetica", "", 11)
            pdf.cell(0, 6, f"{edu.get('location', '')} | {edu.get('startYear', '')} - {edu.get('endYear', '')}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            pdf.ln(2)
        pdf.ln(2)

    # Certifications
    certifications = resume_data.get('certifications', [])
    if certifications:
        add_section_header("Certifications")
        pdf.set_font("helvetica", "", 11)
        for cert in certifications:
            pdf.multi_cell(0, 6, f"- {cert}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(5)

    # Save
    pdf.output(output_path)

def main():
    json_dir = r"d:\Veyra\Resumes"
    output_dir = os.path.join(json_dir, "PDFs")
    os.makedirs(output_dir, exist_ok=True)
    
    for json_file in glob.glob(os.path.join(json_dir, "*.json")):
        print(f"Processing {json_file}")
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        for resume in data.get('resumes', []):
            name = resume.get('fullName', f"Resume_{resume.get('resumeNumber', 'Unknown')}")
            # Replace unicode chars with ascii
            def sanitize(text):
                if not isinstance(text, str):
                    return text
                return text.encode('ascii', 'ignore').decode('ascii')
                
            def sanitize_dict(d):
                if isinstance(d, dict):
                    return {k: sanitize_dict(v) for k, v in d.items()}
                elif isinstance(d, list):
                    return [sanitize_dict(v) for v in d]
                else:
                    return sanitize(d)
                    
            safe_resume = sanitize_dict(resume)
            
            safe_name = "".join([c for c in name if c.isalpha() or c.isdigit() or c==' ']).rstrip().replace(" ", "_")
            pdf_filename = f"{safe_name}.pdf"
            output_path = os.path.join(output_dir, pdf_filename)
            try:
                create_resume_pdf(safe_resume, output_path)
                print(f"  Created: {pdf_filename}")
            except Exception as e:
                print(f"  Failed for {name}: {e}")

if __name__ == "__main__":
    main()
