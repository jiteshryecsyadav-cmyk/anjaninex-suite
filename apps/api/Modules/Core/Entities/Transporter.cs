using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Namokara.Api.Modules.Core.Entities;

public class Transporter
{
    public Guid Id { get; set; }
    public Guid FirmId { get; set; }

    [Required, MaxLength(200)]
    public string FirmName { get; set; } = "";

    [MaxLength(120)] public string? ContactPerson { get; set; }
    [MaxLength(20)] public string? Mobile { get; set; }
    [MaxLength(20)] public string? Whatsapp { get; set; }
    [MaxLength(20)] public string? GstNo { get; set; }
    [MaxLength(10)] public string? Pan { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    [MaxLength(100)] public string? State { get; set; }
    [MaxLength(10)] public string? Pincode { get; set; }
    [MaxLength(150)] public string? Email { get; set; }
    public string? Address { get; set; }
    [MaxLength(20)] public string? ContactMobile { get; set; }
    [MaxLength(20)] public string? Landline { get; set; }

    // Performance metrics
    public int? AvgDeliveryDays { get; set; }
    [Column(TypeName = "numeric(5,2)")] public decimal? DamageRate { get; set; }
    [MaxLength(2)] public string? Rating { get; set; }      // A+, A, B, C
    public int? Stars { get; set; }                          // 1-5

    public string? Remark { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
