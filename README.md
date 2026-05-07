# calisto.github.io
Calisto AI Screener 

AI-Powered Eye Disease Screener Using Fundus Images

An automated screening tool designed to detect early-stage eye diseases using retinal fundus images. This project aims to support optometrists by providing a cost-effective, non-invasive, and high-accuracy screening solution.

📖 Table of Contents

Executive Summary

Key Features

Technical Approach

System Architecture

Implementation Plan

Risk Management

Team

🌟 Executive Summary

Global visual impairment affects 2.2 billion people, yet nearly 50% of these cases are preventable through early detection. Current screening methods often rely on expensive equipment and specialist dependency. Our AI-Powered Eye Disease Screener leverages Machine Learning (Multiclass SVM) to analyze fundus images for the presence of:

Diabetic Retinopathy (DR)

Glaucoma

Cataracts

Age-Related Macular Degeneration (AMD)

🚀 Key Features

Multi-Disease Detection: Classifies images into "Healthy" or one of four major eye pathologies.

Advanced Pre-processing: Utilizes CLAHE (Contrast Limited Adaptive Histogram Equalization) for enhanced feature visibility.

Specialized Feature Extraction: Analyzes texture, intensity, vessel-related features, and optic disc parameters.

Automated Workflow: Streamlines the screening process to assist optometrists in retail and clinical settings.

🛠 Technical Approach

1. Data Acquisition

The model is trained on a robust dataset sourced from public repositories (Kaggle) and validated against industry standards.

Dataset Size: Target of 1,300 images per class to ensure balance.

2. Image Pre-processing

Resizing: Standardizing image dimensions.

Grayscale Conversion: For intensity-based analysis.

Contrast Enhancement: Using CLAHE to highlight retinal lesions and vessel structures.

3. Classification Model

The project utilizes a Multiclass SVM (One-vs-Rest) architecture.

Reasoning: High accuracy for medical imaging, efficient with high-dimensional feature spaces, and robust against overfitting on medium-sized datasets.

🏗 System Architecture

The system follows a modular pipeline:

Input: Fundus Image Upload (JPEG/PNG).

Pre-processing: Noise reduction and contrast enhancement.

Feature Extraction: Mathematical representation of retinal structures.

ML Inference: SVM classification.

Output: Screening Report (Disease Detected / No Disease Detected).

📋 Implementation Plan

Phase

Task

Deliverable

Phase 1

Literature Review & Data Collection

Technical Proposal

Phase 2

Pre-processing & Feature Selection

Pre-processed Dataset

Phase 3

Model Development & Training

Trained SVM Model

Phase 4

System Integration & Testing

Prototype Screener

Phase 5

Validation & Project Closure

Final Project Report

⚠️ Risk Management

Dataset Quality: Mitigated by manual verification with industry supervisors.

Class Imbalance: Handled by maintaining an equal image count (1300 per class) and monitoring specific class-wise metrics.

Overfitting: Addressed via 80/20 train-test splitting and confusion matrix validation.

👥 Team

Biomedical Integrated Design Project 1 Department of Biomedical Engineering, Session 2025/2026

Name

Role

Matric No.

Farah Farzana binti Azhar Sham

Project Lead / ML Dev

22001096/2

Varshanna A/P Kumar

Data Analyst / Glaucoma Specialist

23005082/1

Mohammad Fahmi Imran bin Marzuki

Pre-processing Lead / AMD Specialist

22001200/2

Academic Advisor: Assoc. Prof. Ir. Dr. Liew Yih Min

Industrial Attachment: Calisto

📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
