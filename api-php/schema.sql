-- api-php/schema.sql
CREATE DATABASE IF NOT EXISTS nishikigoi_koi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nishikigoi_koi;

CREATE TABLE ponds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'kosong',
  unphotographed_fish_qty INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE koi (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pond_id INT UNSIGNED,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255),
  variety VARCHAR(255),
  farm_name VARCHAR(255),
  breeder VARCHAR(255),
  bloodline VARCHAR(255),
  gender VARCHAR(20) DEFAULT 'unknown',
  parent_type VARCHAR(50) DEFAULT 'non_indukan',
  image_url VARCHAR(500),
  birth_date DATE,
  purchase_date DATE,
  purchase_price DECIMAL(14,2),
  current_length_cm DECIMAL(10,2),
  current_weight_g DECIMAL(10,2),
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT,
  sale_price DECIMAL(14,2),
  parent_info TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  archive_location VARCHAR(255) NULL,
  seq INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_koi_archived_at (archived_at),
  INDEX idx_koi_scope_order (archived_at, created_at, id),
  INDEX idx_koi_scope_seq (archived_at, seq),
  INDEX idx_koi_seq (seq),
  FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE koi_growth_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  koi_id INT UNSIGNED NOT NULL,
  measured_at DATETIME NOT NULL,
  length_cm DECIMAL(10,2),
  weight_g DECIMAL(10,2),
  image_url VARCHAR(500),
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (koi_id) REFERENCES koi(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pond_note_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pond_id INT UNSIGNED NOT NULL,
  previous_notes TEXT,
  new_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pond_documentation (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pond_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  media_type VARCHAR(20) DEFAULT 'image',
  thumbnail_url VARCHAR(500),
  display_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active',
  notes TEXT,
  moved_to_gallery_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE farm_reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL,
  report_date DATE NOT NULL,
  pond_id INT UNSIGNED,
  koi_id INT UNSIGNED,
  reporter VARCHAR(255),
  qty INT,
  average_length_cm DECIMAL(10,2),
  average_weight_g DECIMAL(10,2),
  result TEXT,
  notes TEXT,
  video_url VARCHAR(500),
  video_thumbnail_url VARCHAR(500),
  origin_location VARCHAR(255),
  pond_entries TEXT,
  breeding_entries TEXT,
  koi_entries TEXT,
  reporter_entries TEXT,
  dominant_variety VARCHAR(255),
  spectrum_sizes TEXT,
  spectrum_summary TEXT,
  validation_checks TEXT,
  media_entries TEXT,
  report_title VARCHAR(255),
  batch_code VARCHAR(100),
  activity_data MEDIUMTEXT NULL,
  destination_location VARCHAR(255) NULL,
  condition_entries TEXT NULL,
  sorting_entries TEXT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE SET NULL,
  FOREIGN KEY (koi_id) REFERENCES koi(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE breeding_batches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  batch_code VARCHAR(100) NOT NULL UNIQUE,
  session_name VARCHAR(255),
  breeding_date DATE NOT NULL,
  male_koi_id INT UNSIGNED,
  female_koi_id INT UNSIGNED,
  male_parent_entries TEXT,
  female_parent_entries TEXT,
  pond_id INT UNSIGNED,
  spawning_method VARCHAR(50) DEFAULT 'alami',
  status VARCHAR(50) DEFAULT 'planning',
  fry_count INT,
  notes TEXT,
  video_url VARCHAR(500),
  video_thumbnail_url VARCHAR(500),
  pond_entries TEXT,
  egg_weight_g DECIMAL(10,2),
  media_entries TEXT,
  spawning_started_at DATE NULL,
  fish_separated_at DATE NULL,
  officer_name VARCHAR(255) NULL,
  last_update_date DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (male_koi_id) REFERENCES koi(id) ON DELETE SET NULL,
  FOREIGN KEY (female_koi_id) REFERENCES koi(id) ON DELETE SET NULL,
  FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(40),
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'Operator',
  status VARCHAR(50) DEFAULT 'Active',
  avatar VARCHAR(500),
  cover VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE media_assets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(500) NOT NULL UNIQUE,
  file_path VARCHAR(500),
  segment VARCHAR(100) DEFAULT 'misc',
  media_type VARCHAR(20) DEFAULT 'image',
  size_bytes BIGINT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE media_references (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  media_id INT UNSIGNED NOT NULL,
  owner_type VARCHAR(100) NOT NULL,
  owner_id INT UNSIGNED,
  source_column VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_media_owner (media_id, owner_type, owner_id, source_column),
  FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE app_settings (
  `key` VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE system_notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  message TEXT,
  status VARCHAR(50) DEFAULT 'unread',
  actor VARCHAR(255),
  role VARCHAR(50),
  action VARCHAR(100),
  target_id VARCHAR(100),
  target_label VARCHAR(255),
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME,
  notification_cleared_at DATETIME
) ENGINE=InnoDB;

CREATE TABLE system_jobs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'queued',
  message TEXT,
  progress INT DEFAULT 0,
  started_at DATETIME,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  payload MEDIUMTEXT NULL,
  result MEDIUMTEXT NULL,
  heartbeat_at DATETIME NULL
) ENGINE=InnoDB;

CREATE TABLE form_drafts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  summary VARCHAR(255) NOT NULL DEFAULT '',
  item_count INT UNSIGNED NOT NULL DEFAULT 0,
  data MEDIUMTEXT NOT NULL,
  created_by INT UNSIGNED NULL,
  created_by_name VARCHAR(255) NULL,
  updated_by INT UNSIGNED NULL,
  updated_by_name VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_form_drafts_type (type, updated_at)
) ENGINE=InnoDB;

CREATE TABLE account_sessions (
  id VARCHAR(36) PRIMARY KEY,
  account_id INT UNSIGNED,
  username VARCHAR(100) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50),
  remember_device TINYINT(1) DEFAULT 0,
  ip_address VARCHAR(64),
  user_agent VARCHAR(500),
  status VARCHAR(50) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  logged_out_at DATETIME,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE gallery_collections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pond_id INT UNSIGNED,
  title VARCHAR(255) NOT NULL,
  segment_name VARCHAR(100),
  gallery_date DATE,
  notes TEXT,
  source_type VARCHAR(100),
  source_id INT UNSIGNED,
  archived_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (pond_id) REFERENCES ponds(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE gallery_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  gallery_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  media_type VARCHAR(20) DEFAULT 'image',
  thumbnail_url VARCHAR(500),
  notes TEXT,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gallery_id) REFERENCES gallery_collections(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Sell menu (also created automatically by lib/db.php when missing)
CREATE TABLE IF NOT EXISTS sell_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  price DECIMAL(14,2) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  description TEXT NULL,
  koi_ids TEXT NULL,
  media_entries MEDIUMTEXT NULL,
  documentation_entries MEDIUMTEXT NULL,
  buyer VARCHAR(150) NULL,
  sold_at DATE NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sell_status (status)
) ENGINE=InnoDB;

-- Invoices (also created automatically by lib/db.php when missing)
CREATE TABLE IF NOT EXISTS invoices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(40) NOT NULL,
  title VARCHAR(200) NULL,
  client_name VARCHAR(200) NOT NULL,
  client_contact TEXT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
  items MEDIUMTEXT NULL,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  sales_contact TEXT NULL,
  bank_account TEXT NULL,
  notes TEXT NULL,
  payment_proofs MEDIUMTEXT NULL,
  media_entries MEDIUMTEXT NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoice_no (invoice_no),
  INDEX idx_invoice_date (invoice_date)
) ENGINE=InnoDB;

-- Inventaris (also created automatically by lib/db.php when missing)
CREATE TABLE IF NOT EXISTS inventory_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'habis_pakai',
  category VARCHAR(100) NULL,
  unit VARCHAR(30) NULL,
  image_url VARCHAR(500) NULL,
  min_stock DECIMAL(14,2) NULL,
  monthly_need DECIMAL(14,2) NULL,
  notes TEXT NULL,
  archived_at DATETIME NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_inventory_kind (kind),
  INDEX idx_inventory_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id INT UNSIGNED NOT NULL,
  type VARCHAR(20) NOT NULL,
  qty DECIMAL(14,2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(14,2) NULL,
  total_price DECIMAL(14,2) NULL,
  supplier VARCHAR(200) NULL,
  movement_date DATE NOT NULL,
  location VARCHAR(200) NULL,
  koi_ids TEXT NULL,
  notes TEXT NULL,
  created_by VARCHAR(100) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_inventory_move_item (item_id, movement_date),
  INDEX idx_inventory_move_type (type)
) ENGINE=InnoDB;
