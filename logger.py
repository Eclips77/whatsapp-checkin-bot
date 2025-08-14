#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Professional Logger - מחלקת לוגים גנרית לפרויקטים

מחלקה מקצועית ללוגים שמתאימה לכל פרויקט עם תמיכה בכתיבה לקובץ/טרמינל,
לוגים מובנים, דיווחי תקדמות, ואמינות גבוהה.

Author: Your Name
Version: 1.0.0
"""

import os
import sys
import json
import gzip
import time
import threading
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, List, Callable, Union, TextIO
from dataclasses import dataclass, field
from queue import Queue, Full, Empty
from contextlib import contextmanager
from functools import wraps
import traceback


# ================== Core Classes ==================

@dataclass
class LogRecord:
    """רשומת לוג עם כל המידע הנדרש"""
    timestamp: str
    level: str
    message: str
    logger_name: str
    module: str
    function: str
    line: int
    process_id: int
    thread_id: int
    correlation_id: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """המרה למילון לצורך JSON"""
        return {
            'timestamp': self.timestamp,
            'level': self.level,
            'message': self.message,
            'logger': self.logger_name,
            'module': self.module,
            'function': self.function,
            'line': self.line,
            'pid': self.process_id,
            'tid': self.thread_id,
            'correlation_id': self.correlation_id,
            **self.extra
        }


class BaseHandler:
    """מחלקת בס להנדלרים"""
    
    def __init__(self):
        self.formatter: Optional['BaseFormatter'] = None
        self.filters: List[Callable[[LogRecord], bool]] = []
    
    def set_formatter(self, formatter: 'BaseFormatter'):
        """הגדרת פורמט"""
        self.formatter = formatter
    
    def add_filter(self, filter_func: Callable[[LogRecord], bool]):
        """הוספת פילטר"""
        self.filters.append(filter_func)
    
    def should_handle(self, record: LogRecord) -> bool:
        """בדיקה אם צריך לטפל ברשומה"""
        return all(f(record) for f in self.filters)
    
    def emit(self, record: LogRecord):
        """כתיבת הרשומה - מחלקות ירושה ימימשו"""
        raise NotImplementedError


class ConsoleHandler(BaseHandler):
    """הנדלר לכתיבה לטרמינל עם צבעים"""
    
    # קודי צבעים ANSI
    COLORS = {
        'DEBUG': '\033[36m',      # ציאן
        'INFO': '\033[32m',       # ירוק
        'WARNING': '\033[33m',    # צהוב
        'ERROR': '\033[31m',      # אדום
        'CRITICAL': '\033[91m',   # אדום בהיר
        'PROGRESS': '\033[34m',   # כחול
        'SUCCESS': '\033[92m',    # ירוק בהיר
        'RESET': '\033[0m'        # איפוס
    }
    
    def __init__(self, stream: TextIO = sys.stdout, use_colors: bool = True):
        super().__init__()
        self.stream = stream
        self.use_colors = use_colors and hasattr(stream, 'isatty') and stream.isatty()
    
    def emit(self, record: LogRecord):
        """כתיבה לטרמינל"""
        if not self.should_handle(record):
            return
        
        try:
            if self.formatter:
                message = self.formatter.format(record)
            else:
                message = record.message
            
            # הוספת צבעים
            if self.use_colors:
                color = self.COLORS.get(record.level, '')
                reset = self.COLORS['RESET']
                message = f"{color}{message}{reset}"
            
            print(message, file=self.stream, flush=True)
        except Exception as e:
            # fail-safe: אף פעם לא זורקים exception מלוגר
            print(f"Logger Error: {e}", file=sys.stderr)


class RotatingFileHandler(BaseHandler):
    """הנדלר לכתיבה לקובץ עם רוטציה וקומפרסיה"""
    
    def __init__(self, filename: str, max_bytes: int = 10*1024*1024, 
                 backup_count: int = 5, compress_old: bool = True):
        super().__init__()
        self.filename = Path(filename)
        self.max_bytes = max_bytes
        self.backup_count = backup_count
        self.compress_old = compress_old
        self._lock = threading.Lock()
        
        # יצירת תיקיה אם לא קיימת
        self.filename.parent.mkdir(parents=True, exist_ok=True)
    
    def should_rotate(self) -> bool:
        """בדיקה אם צריך רוטציה"""
        return (self.filename.exists() and 
                self.filename.stat().st_size >= self.max_bytes)
    
    def rotate_files(self):
        """ביצוע רוטציה"""
        with self._lock:
            if not self.should_rotate():
                return
            
            # מחיקת הקובץ הישן ביותר
            oldest = self.filename.with_suffix(f'.{self.backup_count}.gz')
            if oldest.exists():
                oldest.unlink()
            
            # הזזת קבצים
            for i in range(self.backup_count, 0, -1):
                old_file = self.filename.with_suffix(f'.{i}.gz' if i > 1 else '.log')
                new_file = self.filename.with_suffix(f'.{i+1}.gz')
                
                if old_file.exists():
                    if i == 1 and self.compress_old:
                        # דחיסת הקובץ הנוכחי
                        with open(old_file, 'rb') as f_in:
                            with gzip.open(new_file, 'wb') as f_out:
                                f_out.write(f_in.read())
                        old_file.unlink()
                    else:
                        old_file.rename(new_file)
            
            # שינוי שם הקובץ הנוכחי
            if self.filename.exists():
                backup_name = self.filename.with_suffix('.1.log')
                self.filename.rename(backup_name)
    
    def emit(self, record: LogRecord):
        """כתיבה לקובץ"""
        if not self.should_handle(record):
            return
        
        try:
            # בדיקת רוטציה
            if self.should_rotate():
                self.rotate_files()
            
            # כתיבה לקובץ
            with self._lock:
                message = (self.formatter.format(record) if self.formatter 
                          else record.message)
                
                with open(self.filename, 'a', encoding='utf-8') as f:
                    f.write(message + '\n')
                    
        except Exception as e:
            print(f"File Logger Error: {e}", file=sys.stderr)


# ================== Formatters ==================

class BaseFormatter:
    """מחלקת בס לפורמטרים"""
    
    def format(self, record: LogRecord) -> str:
        raise NotImplementedError


class HumanFormatter(BaseFormatter):
    """פורמטר אנושי לטרמינל"""
    
    def __init__(self, include_module: bool = True, include_time: bool = True):
        self.include_module = include_module
        self.include_time = include_time
    
    def format(self, record: LogRecord) -> str:
        parts = []
        
        if self.include_time:
            # זמן מקומי בפורמט קריא
            dt = datetime.fromisoformat(record.timestamp.replace('Z', '+00:00'))
            local_time = dt.astimezone().strftime('%H:%M:%S')
            parts.append(f"[{local_time}]")
        
        parts.append(f"[{record.level}]")
        
        if self.include_module:
            parts.append(f"[{record.module}:{record.line}]")
        
        parts.append(record.message)
        
        # הוספת מידע נוסף אם קיים
        if record.extra:
            extra_str = " | ".join(f"{k}={v}" for k, v in record.extra.items())
            parts.append(f"({extra_str})")
        
        return " ".join(parts)


class JSONFormatter(BaseFormatter):
    """פורמטר JSON למערכות אוטומטיות"""
    
    def __init__(self, include_fields: Optional[List[str]] = None, 
                 exclude_fields: Optional[List[str]] = None):
        self.include_fields = include_fields
        self.exclude_fields = exclude_fields or []
    
    def format(self, record: LogRecord) -> str:
        data = record.to_dict()
        
        # סינון שדות
        if self.include_fields:
            data = {k: v for k, v in data.items() if k in self.include_fields}
        
        for field in self.exclude_fields:
            data.pop(field, None)
        
        return json.dumps(data, ensure_ascii=False, separators=(',', ':'))


# ================== Main Logger Class ==================

class ProfessionalLogger:
    """
    מחלקת לוגים מקצועית וגמישה
    
    תכונות:
    - כתיבה לטרמינל וקובץ
    - לוגים מובנים עם מידע נוסף
    - דיווחי תקדמות
    - אסינכרוני עם fallback סינכרוני
    - רוטציה וקומפרסיה של קבצים
    """
    
    LEVELS = {
        'DEBUG': 10,
        'INFO': 20, 
        'WARNING': 30,
        'ERROR': 40,
        'CRITICAL': 50,
        'PROGRESS': 25,
        'SUCCESS': 22
    }
    
    def __init__(self, name: str = "main", level: str = "INFO", 
                 enable_console: bool = True, enable_file: bool = False,
                 file_path: Optional[str] = None, use_async: bool = True):
        """
        יצירת לוגר חדש
        
        Args:
            name: שם הלוגר
            level: רמת לוג מינימלית
            enable_console: האם להדפיס לטרמינל
            enable_file: האם לכתוב לקובץ
            file_path: נתיב קובץ הלוג
            use_async: האם להשתמש בכתיבה אסינכרונית
        """
        self.name = name
        self.level = level
        self.handlers: List[BaseHandler] = []
        self.context: Dict[str, Any] = {}
        self.correlation_id: Optional[str] = None
        
        # הגדרת async queue
        self.use_async = use_async
        self._async_queue: Optional[Queue] = None
        self._async_thread: Optional[threading.Thread] = None
        self._shutdown = threading.Event()
        
        if self.use_async:
            self._setup_async()
        
        # הגדרת handlers
        if enable_console:
            self.add_console_handler()
        
        if enable_file and file_path:
            self.add_file_handler(file_path)
    
    def _setup_async(self):
        """הגדרת async processing"""
        self._async_queue = Queue(maxsize=1000)
        self._async_thread = threading.Thread(target=self._async_worker, daemon=True)
        self._async_thread.start()
    
    def _async_worker(self):
        """Worker thread לעיבוד אסינכרוני"""
        while not self._shutdown.is_set():
            try:
                record = self._async_queue.get(timeout=1.0)
                if record is None:  # סימן לסיום
                    break
                self._process_record_sync(record)
                self._async_queue.task_done()
            except Empty:
                continue
            except Exception as e:
                print(f"Async Logger Error: {e}", file=sys.stderr)
    
    def add_console_handler(self, use_colors: bool = True, formatter: str = "human"):
        """הוספת handler לטרמינל"""
        handler = ConsoleHandler(use_colors=use_colors)
        
        if formatter == "human":
            handler.set_formatter(HumanFormatter())
        elif formatter == "json":
            handler.set_formatter(JSONFormatter())
        
        self.handlers.append(handler)
        return handler
    
    def add_file_handler(self, file_path: str, max_mb: int = 10, 
                        backups: int = 5, formatter: str = "json"):
        """הוספת handler לקובץ"""
        handler = RotatingFileHandler(
            file_path, max_bytes=max_mb*1024*1024, backup_count=backups
        )
        
        if formatter == "json":
            handler.set_formatter(JSONFormatter())
        elif formatter == "human":
            handler.set_formatter(HumanFormatter())
        
        self.handlers.append(handler)
        return handler
    
    def _should_log(self, level: str) -> bool:
        """בדיקה אם צריך לכתוב לוג ברמה זו"""
        return self.LEVELS.get(level, 0) >= self.LEVELS.get(self.level, 0)
    
    def _create_record(self, level: str, message: str, **kwargs) -> LogRecord:
        """יצירת רשומת לוג"""
        # מידע על המיקום בקוד
        frame = sys._getframe(3)  # 3 רמות למעלה מהקריאה הישירה
        
        # זמן נוכחי ב-UTC
        timestamp = datetime.now(timezone.utc).isoformat()
        
        # מידע נוסף
        extra = {**self.context, **kwargs}
        
        return LogRecord(
            timestamp=timestamp,
            level=level,
            message=message,
            logger_name=self.name,
            module=Path(frame.f_code.co_filename).stem,
            function=frame.f_code.co_name,
            line=frame.f_lineno,
            process_id=os.getpid(),
            thread_id=threading.get_ident(),
            correlation_id=self.correlation_id,
            extra=extra
        )
    
    def _process_record_sync(self, record: LogRecord):
        """עיבוד סינכרוני של רשומה"""
        for handler in self.handlers:
            try:
                handler.emit(record)
            except Exception as e:
                print(f"Handler Error: {e}", file=sys.stderr)
    
    def _process_record(self, record: LogRecord):
        """עיבוד רשומה (async או sync)"""
        if self.use_async and self._async_queue:
            try:
                self._async_queue.put_nowait(record)
            except Full:
                # Queue מלאה - fallback לסינכרוני
                self._process_record_sync(record)
        else:
            self._process_record_sync(record)
    
    # ================== Logging Methods ==================
    
    def debug(self, message: str, **kwargs):
        """לוג debug"""
        if self._should_log('DEBUG'):
            record = self._create_record('DEBUG', message, **kwargs)
            self._process_record(record)
    
    def info(self, message: str, **kwargs):
        """לוג info"""
        if self._should_log('INFO'):
            record = self._create_record('INFO', message, **kwargs)
            self._process_record(record)
    
    def warning(self, message: str, **kwargs):
        """לוג warning"""
        if self._should_log('WARNING'):
            record = self._create_record('WARNING', message, **kwargs)
            self._process_record(record)
    
    def error(self, message: str, **kwargs):
        """לוג error"""
        if self._should_log('ERROR'):
            record = self._create_record('ERROR', message, **kwargs)
            self._process_record(record)
    
    def critical(self, message: str, **kwargs):
        """לוג critical"""
        if self._should_log('CRITICAL'):
            record = self._create_record('CRITICAL', message, **kwargs)
            self._process_record(record)
    
    def success(self, message: str, **kwargs):
        """לוג הצלחה"""
        if self._should_log('SUCCESS'):
            record = self._create_record('SUCCESS', message, **kwargs)
            self._process_record(record)
    
    def progress(self, message: str, current: int = None, total: int = None, **kwargs):
        """דיווח תקדמות"""
        if not self._should_log('PROGRESS'):
            return
        
        if current is not None and total is not None:
            percentage = (current / total) * 100
            progress_bar = self._create_progress_bar(current, total)
            message = f"{message} | {progress_bar} {percentage:.1f}% ({current}/{total})"
        
        record = self._create_record('PROGRESS', message, **kwargs)
        self._process_record(record)
    
    def _create_progress_bar(self, current: int, total: int, width: int = 20) -> str:
        """יצירת progress bar טקסטואלי"""
        filled = int(width * current / total)
        bar = '█' * filled + '░' * (width - filled)
        return f"[{bar}]"
    
    # ================== Context Management ==================
    
    def bind(self, **context):
        """הוספת קונטקסט קבוע"""
        new_logger = ProfessionalLogger(
            name=self.name,
            level=self.level,
            enable_console=False,
            enable_file=False,
            use_async=self.use_async
        )
        new_logger.handlers = self.handlers
        new_logger.context = {**self.context, **context}
        new_logger.correlation_id = self.correlation_id
        new_logger._async_queue = self._async_queue
        return new_logger
    
    def with_correlation(self, correlation_id: str):
        """הוספת correlation ID"""
        new_logger = self.bind()
        new_logger.correlation_id = correlation_id
        return new_logger
    
    @contextmanager
    def timeit(self, operation: str, level: str = 'INFO'):
        """מדידת זמן פעולה"""
        start_time = time.time()
        self.debug(f"Started: {operation}")
        
        try:
            yield
            duration = time.time() - start_time
            getattr(self, level.lower())(
                f"Completed: {operation}",
                duration_ms=round(duration * 1000, 2)
            )
        except Exception as e:
            duration = time.time() - start_time
            self.error(
                f"Failed: {operation} - {str(e)}",
                duration_ms=round(duration * 1000, 2),
                error_type=type(e).__name__
            )
            raise
    
    # ================== Decorators ==================
    
    def log_calls(self, level: str = 'DEBUG', args: bool = False, 
                  result: bool = False, duration: bool = True):
        """דקורטור ללוגים של פונקציות"""
        def decorator(func):
            @wraps(func)
            def wrapper(*func_args, **func_kwargs):
                start_time = time.time()
                func_name = f"{func.__module__}.{func.__name__}"
                
                # לוג תחילת פונקציה
                log_data = {"function": func_name}
                if args:
                    log_data["args"] = str(func_args)
                    log_data["kwargs"] = str(func_kwargs)
                
                getattr(self, level.lower())(f"Calling: {func_name}", **log_data)
                
                try:
                    result_value = func(*func_args, **func_kwargs)
                    
                    # לוג סיום מוצלח
                    end_log_data = {"function": func_name}
                    if duration:
                        end_log_data["duration_ms"] = round((time.time() - start_time) * 1000, 2)
                    if result:
                        end_log_data["result"] = str(result_value)
                    
                    getattr(self, level.lower())(f"Completed: {func_name}", **end_log_data)
                    return result_value
                    
                except Exception as e:
                    # לוג שגיאה
                    error_log_data = {
                        "function": func_name,
                        "error_type": type(e).__name__,
                        "error_message": str(e)
                    }
                    if duration:
                        error_log_data["duration_ms"] = round((time.time() - start_time) * 1000, 2)
                    
                    self.error(f"Failed: {func_name}", **error_log_data)
                    raise
            
            return wrapper
        return decorator
    
    # ================== Configuration ==================
    
    def set_level(self, level: str):
        """שינוי רמת לוג"""
        self.level = level.upper()
    
    def add_filter(self, handler_type: str, filter_func: Callable[[LogRecord], bool]):
        """הוספת פילטר לסוג handler מסוים"""
        for handler in self.handlers:
            if (handler_type == 'console' and isinstance(handler, ConsoleHandler) or
                handler_type == 'file' and isinstance(handler, RotatingFileHandler) or
                handler_type == 'all'):
                handler.add_filter(filter_func)
    
    # ================== Cleanup ==================
    
    def shutdown(self):
        """סגירה נקייה של הלוגר"""
        if self.use_async and self._async_queue and self._async_thread:
            # סיום graceful של ה-async worker
            self._async_queue.put(None)  # סימן סיום
            self._shutdown.set()
            self._async_thread.join(timeout=5.0)


# ================== Factory Functions ==================

def get_logger(name: str = "main", **kwargs) -> ProfessionalLogger:
    """
    פונקציית קיצור ליצירת לוגר
    
    Args:
        name: שם הלוגר
        **kwargs: פרמטרים נוספים ל-ProfessionalLogger
    
    Returns:
        מופע של ProfessionalLogger
    """
    return ProfessionalLogger(name=name, **kwargs)


def setup_project_logger(project_name: str, log_dir: str = "logs", 
                        level: str = "INFO") -> ProfessionalLogger:
    """
    הגדרה מהירה לפרויקט עם קונפיגורציה טובה
    
    Args:
        project_name: שם הפרויקט
        log_dir: תיקיית לוגים
        level: רמת לוג
    
    Returns:
        לוגר מוכן לשימוש
    """
    log_path = Path(log_dir) / f"{project_name}.log"
    
    logger = ProfessionalLogger(
        name=project_name,
        level=level,
        enable_console=True,
        enable_file=True,
        file_path=str(log_path)
    )
    
    # פילטר לסינון סיסמאות
    def security_filter(record: LogRecord) -> bool:
        """פילטר בסיסי לאבטחת מידע"""
        message_lower = record.message.lower()
        sensitive_words = ['password', 'token', 'secret', 'key', 'api_key']
        return not any(word in message_lower for word in sensitive_words)
    
    logger.add_filter('all', security_filter)
    
    return logger


# ================== CLI Interface ==================

def main():
    """
    ממשק שורת פקודה לבדיקה ודמו
    """
    parser = argparse.ArgumentParser(description='Professional Logger - מערכת לוגים מקצועית')
    parser.add_argument('--level', default='INFO', 
                       choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
                       help='רמת לוג מינימלית')
    parser.add_argument('--console', action='store_true', default=True,
                       help='הצגה בטרמינל')
    parser.add_argument('--file', type=str,
                       help='נתיב לקובץ לוג')
    parser.add_argument('--json', action='store_true',
                       help='פורמט JSON (במקום אנושי)')
    parser.add_argument('--demo', action='store_true',
                       help='הרצת דמו')
    
    args = parser.parse_args()
    
    # יצירת לוגר
    logger = ProfessionalLogger(
        name="cli",
        level=args.level,
        enable_console=args.console,
        enable_file=bool(args.file),
        file_path=args.file
    )
    
    # שינוי פורמט אם נדרש
    if args.json:
        for handler in logger.handlers:
            if isinstance(handler, ConsoleHandler):
                handler.set_formatter(JSONFormatter())
    
    if args.demo:
        run_demo(logger)
    else:
        print("Logger ready. Use --demo for demonstration.")


def run_demo(logger: ProfessionalLogger):
    """
    הרצת דמו המדגים את כל היכולות
    """
    print("🚀 Professional Logger Demo")
    print("=" * 50)
    
    # לוגים בסיסיים
    logger.info("מתחיל דמו של מערכת הלוגים")
    logger.debug("זהו לוג debug - לא יוצג אם הרמה INFO או יותר")
    logger.warning("זוהי אזהרה")
    logger.error("זוהי שגיאה לדמו")
    logger.success("פעולה הושלמה בהצלחה!")
    
    # קונטקסט
    user_logger = logger.bind(user_id=12345, session="demo_session")
    user_logger.info("פעולה עם קונטקסט משתמש")
    
    # correlation ID
    request_logger = logger.with_correlation("req-abc123")
    request_logger.info("בקשה עם correlation ID")
    
    # תקדמות
    print("\n📊 דמו תקדמות:")
    for i in range(0, 101, 20):
        logger.progress("עיבוד נתונים", current=i, total=100)
        time.sleep(0.5)
    
    # מדידת זמן
    print("\n⏱️  דמו מדידת זמן:")
    with logger.timeit("פעולה ארוכה"):
        time.sleep(1)
    
    # דקורטור
    print("\n🎯 דמו דקורטור:")
    
    @logger.log_calls(level='INFO', duration=True)
    def example_function(x, y):
        time.sleep(0.1)
        return x + y
    
    result = example_function(5, 3)
    logger.info(f"תוצאת פונקציה: {result}")
    
    print("\n✅ דמו הושלם!")


if __name__ == "__main__":
    main()