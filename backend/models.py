"""
Database models for the Crime Investigation GPT platform.
"""
from datetime import datetime
from typing import Optional, List

from sqlalchemy import Boolean, String, Text, DateTime, ForeignKey, Integer, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    """Investigator account."""
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    organization: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    badge_role: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Subscription, mirrored from Razorpay. Pro access lasts until current_period_end.
    subscription_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    subscription_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    plan_interval: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # monthly|yearly
    current_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_at_period_end: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False)

    cases: Mapped[List["Case"]] = relationship("Case", back_populates="user", cascade="all, delete-orphan")


class Case(Base):
    """Investigation case - each case has its own graph, messages and evidence."""
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    case_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="active")  # active|cold|closed
    priority: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="medium")  # low|medium|high|critical
    graph_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # nx.node_link_data as JSON
    brief_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # last AI case brief
    # Evidence-board node positions saved by the investigator. Kept apart from graph_json so a
    # chat turn rewriting the graph can never clobber a layout saved at the same moment.
    layout_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    brief_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="cases")
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="case", cascade="all, delete-orphan", order_by="Message.id"
    )
    evidence: Mapped[List["Evidence"]] = relationship(
        "Evidence", back_populates="case", cascade="all, delete-orphan", order_by="Evidence.id"
    )


class Message(Base):
    """Chat message - conversation history per case."""
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    case: Mapped["Case"] = relationship("Case", back_populates="messages")


class Evidence(Base):
    """An uploaded evidence file (document text or image description)."""
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    case_id: Mapped[int] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # document|image|text
    content_text: Mapped[str] = mapped_column(Text, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)  # chain-of-custody fingerprint
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    case: Mapped["Case"] = relationship("Case", back_populates="evidence")


class Usage(Base):
    """Metered AI usage per user per calendar month (UTC), e.g. period "2026-10"."""
    __tablename__ = "usage"
    __table_args__ = (UniqueConstraint("user_id", "period", name="uq_usage_user_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    messages: Mapped[int] = mapped_column(Integer, default=0)
    uploads: Mapped[int] = mapped_column(Integer, default=0)
    briefs: Mapped[int] = mapped_column(Integer, default=0)


class Payment(Base):
    """A successful subscription charge, recorded once per Razorpay payment id."""
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_payment_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    subscription_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # paise
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    method: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="captured")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class AuditLog(Base):
    """Append-only record of who did what - required for any law-enforcement deployment."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    case_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
