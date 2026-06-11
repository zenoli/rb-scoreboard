'use client'

import React from 'react'

interface PlayerIconProps {
  imagePath: string | null
  name: string | null
  teamImagePath?: string | null
  points?: number
  pointsLabel?: string
  size?: number
  avatarClassName?: string
  className?: string
}

export function PlayerIcon({
  imagePath,
  name,
  teamImagePath,
  points,
  pointsLabel,
  size = 40,
  avatarClassName = 'ring-1 ring-border shadow-sm',
  className,
}: PlayerIconProps) {
  const badgeSize = Math.round(size * 0.38)
  const badgeOffset = Math.round(-badgeSize * 0.28)
  const showFlag = !!teamImagePath
  const resolvedPointsLabel = pointsLabel ?? (typeof points === 'number' && points > 0 ? (points % 1 === 0 ? String(points) : points.toFixed(1)) : null)
  const showPoints = resolvedPointsLabel !== null

  return (
    <div
      className={`relative flex-shrink-0${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <div className={`w-full h-full rounded-full overflow-hidden bg-muted drop-shadow-md ${avatarClassName}`}>
        {imagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePath} alt={name ?? ''} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center font-bold text-muted-foreground"
            style={{ fontSize: Math.round(size * 0.3) }}
          >
            {(name ?? '?').slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {showFlag && (
        <div
          className="absolute rounded-full overflow-hidden shadow-sm"
          style={{
            width: badgeSize,
            height: badgeSize,
            bottom: badgeOffset,
            right: badgeOffset,
            zIndex: 10,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={teamImagePath!}
            alt=""
            className="w-full h-full object-cover scale-150"
          />
        </div>
      )}

      {showPoints && (
        <div
          className="absolute rounded-full bg-black text-white font-bold flex items-center justify-center shadow whitespace-nowrap"
          style={{
            minWidth: badgeSize,
            height: badgeSize,
            paddingInline: Math.round(badgeSize * 0.2),
            bottom: badgeOffset,
            left: badgeOffset,
            zIndex: 10,
            fontSize: Math.round(badgeSize * 0.5),
            lineHeight: 1,
          }}
        >
          {resolvedPointsLabel}
        </div>
      )}
    </div>
  )
}
