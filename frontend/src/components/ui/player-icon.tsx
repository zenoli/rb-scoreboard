'use client'

import React from 'react'

interface PlayerIconProps {
  imagePath: string | null
  name: string | null
  teamImagePath?: string | null
  points?: number
  size?: number
  avatarClassName?: string
  className?: string
}

export function PlayerIcon({
  imagePath,
  name,
  teamImagePath,
  points,
  size = 40,
  avatarClassName = 'ring-1 ring-border shadow-sm',
  className,
}: PlayerIconProps) {
  const badgeSize = Math.round(size * 0.38)
  const badgeOffset = Math.round(-badgeSize * 0.28)
  const showFlag = !!teamImagePath
  const showPoints = typeof points === 'number' && points > 0

  return (
    <div
      className={`relative flex-shrink-0${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
    >
      <div className={`w-full h-full rounded-full overflow-hidden bg-muted ${avatarClassName}`}>
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
          className="absolute rounded-full overflow-hidden ring-1 ring-background shadow-sm"
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
          className="absolute rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center shadow ring-1 ring-background"
          style={{
            width: badgeSize,
            height: badgeSize,
            bottom: badgeOffset,
            left: badgeOffset,
            zIndex: 10,
            fontSize: Math.round(badgeSize * 0.55),
            lineHeight: 1,
          }}
        >
          {points! % 1 === 0 ? points : points!.toFixed(1)}
        </div>
      )}
    </div>
  )
}
