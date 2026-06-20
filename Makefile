# ==========================================
# Production Python Project Makefile
# ==========================================

# --- Variables ---
# System paths and executables
PYTHON_EXT = python3
VENV_DIR   = .venv
PYTHON     = $(VENV_DIR)/bin/python
PIP        = $(VENV_DIR)/bin/pip

# Scripts
DOWNLOAD_SCRIPT  = src/download.py
TRANSFORM_SCRIPT = src/transform.py

# Data Files
RAW_DATA       = data/raw/input_data.csv
PROCESSED_DATA = data/processed/output_data.json

# --- Default Target ---
.PHONY: all
all: transform

# --- Environment & Setup ---

# Create virtual environment and install dependencies
.PHONY: setup
setup: $(VENV_DIR)/touchfile

$(VENV_DIR)/touchfile: requirements.txt
	@echo "📦 Creating virtual environment and installing dependencies..."
	test -d $(VENV_DIR) || $(PYTHON_EXT) -m venv $(VENV_DIR)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt
	touch $(VENV_DIR)/touchfile
	@echo "✅ Setup complete. Virtual environment ready."

# --- Data Pipeline ---

# 1. Download target
.PHONY: download
download: setup $(RAW_DATA)

$(RAW_DATA): $(DOWNLOAD_SCRIPT)
	@echo "⬇️  Running data download script..."
	mkdir -p data/raw
	$(PYTHON) $(DOWNLOAD_SCRIPT)
	@echo "✅ Download complete."

# 2. Transform target
.PHONY: transform
transform: setup $(PROCESSED_DATA)

$(PROCESSED_DATA): $(RAW_DATA) $(TRANSFORM_SCRIPT)
	@echo "🔄 Running data transformation script..."
	mkdir -p data/processed
	$(PYTHON) $(TRANSFORM_SCRIPT)
	@echo "✅ Transformation complete."

# --- Code Quality & Testing ---

# Run tests using pytest
.PHONY: test
test: setup
	@echo "🧪 Running tests..."
	$(PYTHON) -m pytest tests/

# Run linting and formatting checking (ruff/black/flake8)
.PHONY: lint
lint: setup
	@echo "✨ Linting and formatting code..."
	$(PYTHON) -m ruff check . || true
	$(PYTHON) -m black --check . || true

# Format code automatically
.PHONY: format
format: setup
	@echo "🧹 Auto-formatting code..."
	$(PYTHON) -m ruff check --fix .
	$(PYTHON) -m black .

# --- Cleanup ---

# Clean data, cache, and virtual environment
.PHONY: clean
clean:
	@echo "🧹 Cleaning up data files and Python cache..."
	rm -rf data/raw data/processed
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

.PHONY: clean-all
clean-all: clean
	@echo "🔥 Destroying virtual environment..."
	rm -rf $(VENV_DIR)